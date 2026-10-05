import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { appendFile, copyFile, mkdir, readdir, rename, stat, statfs, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { resolve, join } from 'node:path';
import { env } from '../../lib/env.js';
import type { AlertaBackupDTO, StatusBackupDTO } from '@hermes/shared';
import { AppError, naoEncontrado } from '../../lib/errors.js';
import { novaCifra } from '../../lib/cofre.js';

// ============================================================
// Backup do banco — o seguro contra "o PC da oficina morreu".
// Gera um .sql com pg_dump, guarda em BACKUP_DIR (SSD do mini PC) e,
// se houver, uma segunda cópia no HD externo; apaga os antigos de cada
// lugar pela retenção de cada um (14 dias no SSD, 60 no HD).
// ============================================================

/**
 * Arquivo que o instalador grava na raiz do HD externo. Sem ele, a pasta do
 * ponto de montagem é só uma pasta vazia no SSD (HD desconectado) — e copiar
 * para lá daria a impressão de backup externo sem haver nenhum.
 */
export const MARCA_HD = '.hermes-hd-externo';

const PREFIXO = 'hermes-';
const SUFIXO = '.sql';
/** Com BACKUP_SENHA: a mesma cópia, cifrada (lib/cofre.ts). */
const SUFIXO_CIFRADO = '.sql.enc';
const PARCIAL = '.parcial'; // dump ainda em andamento; vira .sql só quando termina
const MINIMO_MANTIDO = 3; // nunca deixa a pasta sem cópia, mesmo com retenção curta
const UMA_HORA = 60 * 60 * 1000;
/**
 * --clean --if-exists: o arquivo restaura "por cima" de um banco existente.
 * --no-owner --no-privileges: restaura com qualquer usuário (outro servidor, nuvem).
 */
const OPCOES_DUMP = ['--clean', '--if-exists', '--no-owner', '--no-privileges'];
/** Só nomes gerados por nós: bloqueia "../" e afins no download. */
const NOME_VALIDO = /^hermes-\d{4}-\d{2}-\d{2}_\d{6}\.sql(\.enc)?$/;
const ehBackup = (nome: string) => nome.startsWith(PREFIXO) && (nome.endsWith(SUFIXO) || nome.endsWith(SUFIXO_CIFRADO));
const UM_DIA = 24 * UMA_HORA;

export interface ArquivoBackup {
  arquivo: string;
  criadoEm: string;
  bytes: number;
}

/** Dados de conexão tirados da DATABASE_URL. */
function conexao() {
  const url = new URL(env.DATABASE_URL);
  return {
    host: url.hostname,
    porta: url.port || '5432',
    usuario: decodeURIComponent(url.username),
    senha: decodeURIComponent(url.password),
    banco: url.pathname.replace(/^\//, ''),
    ehLocal: ['localhost', '127.0.0.1', '::1'].includes(url.hostname),
  };
}

function pastaBackup() {
  return resolve(process.cwd(), env.BACKUP_DIR);
}

/**
 * hermes-2026-07-13_091205.sql — ordenável por nome e legível por humano.
 * Os segundos entram no nome de propósito: sem eles, dois backups no mesmo
 * minuto gravariam no mesmo arquivo, e uma falha no segundo apagaria o primeiro.
 */
function nomeArquivo(agora: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  const data = `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
  const hora = `${p(agora.getHours())}${p(agora.getMinutes())}${p(agora.getSeconds())}`;
  return `${PREFIXO}${data}_${hora}${env.BACKUP_SENHA ? SUFIXO_CIFRADO : SUFIXO}`;
}

/**
 * Roda um comando escrevendo a saída direto no arquivo de destino.
 * Espera as duas pontas: o processo terminar E o arquivo ser gravado por
 * inteiro. Se qualquer uma falhar, apaga o arquivo pela metade — um backup
 * truncado é pior que nenhum, porque parece que existe.
 */
async function dumpPara(destino: string, comando: string, args: string[], extraEnv: Record<string, string>) {
  // Com BACKUP_SENHA, o SQL passa pela cifra no caminho: nunca toca o disco em claro.
  const cofre = env.BACKUP_SENHA ? await novaCifra(env.BACKUP_SENHA) : null;
  const proc = spawn(comando, args, { env: { ...process.env, ...extraEnv } });

  let erro = '';
  proc.stderr.on('data', (chunk) => {
    erro += String(chunk);
  });

  const encerrou = new Promise<number>((ok, falhou) => {
    proc.on('error', (err) => falhou(new AppError(500, `Não consegui executar "${comando}": ${err.message}`)));
    proc.on('close', (code) => ok(code ?? -1));
  });
  const saida = createWriteStream(destino);
  if (cofre) saida.write(cofre.cabecalho);
  const gravou = cofre ? pipeline(proc.stdout, cofre.cifra, saida) : pipeline(proc.stdout, saida);

  try {
    const [code] = await Promise.all([encerrou, gravou]);
    if (code !== 0) {
      throw new AppError(500, `pg_dump falhou (código ${code}): ${erro.trim() || 'sem detalhes'}`);
    }
    // A etiqueta de autenticidade do GCM fecha o arquivo.
    if (cofre) await appendFile(destino, cofre.cifra.getAuthTag());
  } catch (err) {
    // O Windows não deixa apagar arquivo com handle aberto: fecha a gravação
    // e espera ela terminar antes de remover o pedaço que sobrou.
    saida.destroy();
    await gravou.catch(() => {});
    await unlink(destino).catch(() => {});
    throw err instanceof AppError ? err : new AppError(500, `Falha ao gravar o backup: ${(err as Error).message}`);
  }
}

/**
 * Duas formas de chamar o pg_dump, nessa ordem:
 * 1. Banco local → dentro do container do docker-compose. Versão do pg_dump
 *    sempre bate com a do servidor e não exige Postgres instalado na máquina.
 * 2. Qualquer outro caso (ou docker fora do ar) → pg_dump da própria máquina.
 */
async function gerarDump(destino: string) {
  const { host, porta, usuario, senha, banco, ehLocal } = conexao();

  if (ehLocal) {
    try {
      const args = ['exec', '-e', `PGPASSWORD=${senha}`, env.BACKUP_CONTAINER, 'pg_dump', '-U', usuario, '-d', banco, ...OPCOES_DUMP];
      await dumpPara(destino, 'docker', args, {});
      return 'docker';
    } catch {
      // Docker parado ou container com outro nome: cai para o pg_dump local.
    }
  }

  const args = ['-h', host, '-p', porta, '-U', usuario, '-d', banco, ...OPCOES_DUMP];
  await dumpPara(destino, 'pg_dump', args, { PGPASSWORD: senha });
  return 'pg_dump';
}

/** Cópias numa pasta (SSD ou HD), da mais nova para a mais antiga. Pasta que não existe = nenhuma. */
export async function listarPasta(pasta: string): Promise<ArquivoBackup[]> {
  const nomes = (await readdir(pasta).catch(() => [] as string[])).filter(ehBackup);
  const arquivos = await Promise.all(
    nomes.map(async (arquivo) => {
      const info = await stat(join(pasta, arquivo));
      return { arquivo, criadoEm: info.mtime.toISOString(), bytes: info.size };
    }),
  );
  return arquivos.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

/** Apaga as cópias mais velhas que a retenção, preservando sempre as 3 últimas. */
export async function podarPasta(pasta: string, retencaoDias: number): Promise<number> {
  const arquivos = await listarPasta(pasta);
  const limite = Date.now() - retencaoDias * UM_DIA;

  const apagaveis = arquivos.slice(MINIMO_MANTIDO).filter((a) => new Date(a.criadoEm).getTime() < limite);
  for (const alvo of apagaveis) {
    await unlink(join(pasta, alvo.arquivo)).catch(() => {});
  }

  // Restos de cópias interrompidas (PC desligado no meio) não podem se acumular.
  const restos = (await readdir(pasta).catch(() => [] as string[])).filter((n) => n.endsWith(PARCIAL));
  for (const resto of restos) {
    const info = await stat(join(pasta, resto)).catch(() => null);
    if (info && Date.now() - info.mtimeMs > UMA_HORA) {
      await unlink(join(pasta, resto)).catch(() => {});
    }
  }

  return apagaveis.length;
}

/** Backups do SSD, do mais novo para o mais antigo. */
export async function listarBackups(): Promise<ArquivoBackup[]> {
  await mkdir(pastaBackup(), { recursive: true });
  return listarPasta(pastaBackup());
}

// ---- HD externo -------------------------------------------------------------

/** O HD está montado de verdade (tem a marca), e não só a pasta vazia do ponto de montagem. */
export const hdMontado = (pastaHd: string) => existsSync(join(pastaHd, MARCA_HD));

/**
 * Leva uma cópia pronta do SSD para o HD: grava como .parcial e só então
 * renomeia (HD arrancado no meio não deixa arquivo pela metade com nome de
 * backup). Já existindo lá, não copia de novo. Depois, aplica a retenção do HD.
 */
export async function enviarAoHd(origem: string, nome: string, pastaHd: string, retencaoDias: number): Promise<'ok' | 'ausente'> {
  if (!hdMontado(pastaHd)) return 'ausente';
  const destino = join(pastaHd, nome);
  if (!existsSync(destino)) {
    const parcial = `${destino}${PARCIAL}`;
    await copyFile(origem, parcial);
    await rename(parcial, destino);
  }
  await podarPasta(pastaHd, retencaoDias);
  return 'ok';
}

/** Última falha ao gravar no HD (disco cheio, HD com defeito), até a próxima tentativa. */
let falhaNoHd: string | null = null;

/** O erro de disco dito para o Dono; o código fica entre parênteses para o suporte. */
const MOTIVOS_HD: Record<string, string> = {
  ENOSPC: 'o HD está cheio',
  EACCES: 'sem permissão para gravar no HD',
  EPERM: 'sem permissão para gravar no HD',
  EROFS: 'o HD ficou só para leitura (pode estar com defeito)',
  EIO: 'erro de gravação (o HD pode estar com defeito ou foi desconectado)',
};
const motivoNoHd = (err: NodeJS.ErrnoException) =>
  err.code && MOTIVOS_HD[err.code] ? `${MOTIVOS_HD[err.code]} (${err.code})` : err.message;

/** A cópia no HD configurado em BACKUP_DIR_EXTERNO. Nunca lança: o backup do SSD já está salvo. */
async function copiaNoHd(origem: string, nome: string): Promise<'ok' | 'ausente' | 'falhou' | 'desligado'> {
  const pastaHd = env.BACKUP_DIR_EXTERNO;
  if (!pastaHd) return 'desligado';
  try {
    const r = await enviarAoHd(origem, nome, pastaHd, env.BACKUP_RETENCAO_DIAS_EXTERNO);
    // Gravou, ou o HD saiu: a falha antiga não vale mais (o aviso passa a ser "desconectado").
    falhaNoHd = null;
    return r;
  } catch (err) {
    falhaNoHd = motivoNoHd(err as NodeJS.ErrnoException);
    return 'falhou';
  }
}

let rodando = false;

/** Gera um backup agora. Retorna o arquivo criado. */
export async function gerarBackup() {
  if (rodando) throw new AppError(409, 'Já existe um backup em andamento');
  rodando = true;
  try {
    const pasta = pastaBackup();
    await mkdir(pasta, { recursive: true });

    const arquivo = nomeArquivo(new Date());
    const destino = join(pasta, arquivo);

    // Grava num arquivo temporário e só promove ao nome final quando o dump
    // termina bem: um backup válido que já exista nunca é posto em risco.
    const parcial = `${destino}${PARCIAL}`;
    const via = await gerarDump(parcial);
    await rename(parcial, destino);

    const info = await stat(destino);
    const removidos = await podarPasta(pasta, env.BACKUP_RETENCAO_DIAS);
    const hdExterno = await copiaNoHd(destino, arquivo);

    return { arquivo, criadoEm: info.mtime.toISOString(), bytes: info.size, via, removidos, hdExterno };
  } finally {
    rodando = false;
  }
}

/** Abre um backup para download (o Dono guarda fora do computador da oficina). */
export async function abrirArquivo(nome: string) {
  if (!NOME_VALIDO.test(nome)) throw naoEncontrado('Arquivo de backup não encontrado');
  const caminho = join(pastaBackup(), nome);
  const info = await stat(caminho).catch(() => null);
  if (!info) throw naoEncontrado('Arquivo de backup não encontrado');
  return { stream: createReadStream(caminho), bytes: info.size };
}

/** Espaço livre numa pasta, em bytes (null se não der para medir). */
async function espacoLivre(pasta: string): Promise<number | null> {
  try {
    const s = await statfs(pasta);
    return s.bavail * s.bsize;
  } catch {
    return null;
  }
}

/** Situação do backup, para a tela mostrar ("último backup: hoje 09:12"). */
export async function statusBackup(): Promise<StatusBackupDTO> {
  const arquivos = await listarBackups();
  const ultimo = arquivos[0] ?? null;
  const atrasado = !ultimo || Date.now() - new Date(ultimo.criadoEm).getTime() > UM_DIA;

  const pastaHd = env.BACKUP_DIR_EXTERNO;
  let hdExterno: StatusBackupDTO['hdExterno'] = null;
  if (pastaHd) {
    const montado = hdMontado(pastaHd);
    const noHd = montado ? await listarPasta(pastaHd) : [];
    hdExterno = {
      montado,
      ultimo: noHd[0] ?? null,
      total: noHd.length,
      retencaoDias: env.BACKUP_RETENCAO_DIAS_EXTERNO,
      livreBytes: montado ? await espacoLivre(pastaHd) : null,
      erro: falhaNoHd,
    };
  }

  return {
    ativo: env.BACKUP_ENABLED,
    criptografado: !!env.BACKUP_SENHA,
    pasta: pastaBackup(),
    retencaoDias: env.BACKUP_RETENCAO_DIAS,
    ultimo,
    atrasado,
    total: arquivos.length,
    arquivos: arquivos.slice(0, 10),
    hdExterno,
  };
}

/**
 * O que o painel do Dono precisa saber: só aparece quando há problema —
 * backup com mais de 24 h, HD externo desconectado ou falhando. null = tudo certo.
 */
export async function alertaDeBackup(): Promise<AlertaBackupDTO | null> {
  if (!env.BACKUP_ENABLED) return null;
  const [ultimo] = await listarBackups();
  const atrasado = !ultimo || Date.now() - new Date(ultimo.criadoEm).getTime() > UM_DIA;
  const pastaHd = env.BACKUP_DIR_EXTERNO;
  const hdAusente = !!pastaHd && !hdMontado(pastaHd);
  const hdErro = pastaHd ? falhaNoHd : null;
  if (!atrasado && !hdAusente && !hdErro) return null;
  return { atrasado, ultimoEm: ultimo?.criadoEm ?? null, hdAusente, hdErro };
}

// ---- Agendador ------------------------------------------------------------
// O PC da oficina fica desligado à noite, então agendar "todo dia às 2h" não
// funciona. A regra é por idade: se a cópia mais nova passou de 24h, faz outra.
// Vale no boot (pega o dia em que ficou desligado) e de hora em hora.

const INTERVALO_CHECAGEM = UMA_HORA;

/** Último estado do HD visto pelo agendador — o log só fala quando muda. */
let estadoHd: string | null = null;

function registrarHd(estado: string, log: (msg: string) => void) {
  if (estado === estadoHd) return;
  estadoHd = estado;
  if (estado === 'ausente') log('⚠️  HD externo não está montado (sem o arquivo-marca): as cópias estão só no SSD.');
  if (estado === 'falhou') log(`⚠️  Não consegui gravar no HD externo: ${falhaNoHd}`);
  if (estado === 'ok') log('💽 HD externo montado: cópias em dia.');
}

async function backupSeAtrasado(log: (msg: string) => void) {
  try {
    const [ultimo] = await listarBackups();
    if (ultimo && Date.now() - new Date(ultimo.criadoEm).getTime() < UM_DIA) {
      // Cópia do dia já existe. O HD pode ter voltado depois dela: leva a última para lá.
      registrarHd(await copiaNoHd(join(pastaBackup(), ultimo.arquivo), ultimo.arquivo), log);
      return;
    }

    const feito = await gerarBackup();
    log(`💾 Backup do banco gerado: ${feito.arquivo} (${Math.round(feito.bytes / 1024)} KB, via ${feito.via})`);
    registrarHd(feito.hdExterno, log);
  } catch (err) {
    // Backup é rede de segurança: se falhar, avisa alto e claro, mas nunca
    // derruba a API — a oficina continua atendendo.
    log(`⚠️  Backup automático falhou: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function iniciarAgendadorDeBackup(log: (msg: string) => void = console.log) {
  if (!env.BACKUP_ENABLED) {
    log('💾 Backup automático desligado (BACKUP_ENABLED=false).');
    return () => {};
  }

  // No boot, espera a API subir antes de disputar CPU com o primeiro atendimento.
  const inicial = setTimeout(() => void backupSeAtrasado(log), 15_000);
  const timer = setInterval(() => void backupSeAtrasado(log), INTERVALO_CHECAGEM);
  timer.unref?.();

  return () => {
    clearTimeout(inicial);
    clearInterval(timer);
  };
}
