import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { resolve, join } from 'node:path';
import { env } from '../../lib/env.js';
import { AppError } from '../../lib/errors.js';

// ============================================================
// Backup do banco (Fase 5) — o seguro contra "o PC da oficina morreu".
// Gera um .sql com pg_dump, guarda em BACKUP_DIR e apaga os antigos.
// ============================================================

const PREFIXO = 'hermes-';
const SUFIXO = '.sql';
const PARCIAL = '.parcial'; // dump ainda em andamento; vira .sql só quando termina
const MINIMO_MANTIDO = 3; // nunca deixa a pasta sem cópia, mesmo com retenção curta
const UMA_HORA = 60 * 60 * 1000;
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
  return `${PREFIXO}${data}_${hora}${SUFIXO}`;
}

/**
 * Roda um comando escrevendo a saída direto no arquivo de destino.
 * Espera as duas pontas: o processo terminar E o arquivo ser gravado por
 * inteiro. Se qualquer uma falhar, apaga o arquivo pela metade — um backup
 * truncado é pior que nenhum, porque parece que existe.
 */
async function dumpPara(destino: string, comando: string, args: string[], extraEnv: Record<string, string>) {
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
  const gravou = pipeline(proc.stdout, saida);

  try {
    const [code] = await Promise.all([encerrou, gravou]);
    if (code !== 0) {
      throw new AppError(500, `pg_dump falhou (código ${code}): ${erro.trim() || 'sem detalhes'}`);
    }
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
      const args = ['exec', '-e', `PGPASSWORD=${senha}`, env.BACKUP_CONTAINER, 'pg_dump', '-U', usuario, '-d', banco];
      await dumpPara(destino, 'docker', args, {});
      return 'docker';
    } catch {
      // Docker parado ou container com outro nome: cai para o pg_dump local.
    }
  }

  const args = ['-h', host, '-p', porta, '-U', usuario, '-d', banco];
  await dumpPara(destino, 'pg_dump', args, { PGPASSWORD: senha });
  return 'pg_dump';
}

/** Apaga backups mais velhos que a retenção, preservando sempre os 3 últimos. */
async function limparAntigos() {
  const pasta = pastaBackup();
  const arquivos = await listarBackups();
  const limite = Date.now() - env.BACKUP_RETENCAO_DIAS * 24 * 60 * 60 * 1000;

  const apagaveis = arquivos.slice(MINIMO_MANTIDO).filter((a) => new Date(a.criadoEm).getTime() < limite);
  for (const alvo of apagaveis) {
    await unlink(join(pasta, alvo.arquivo)).catch(() => {});
  }

  // Restos de dumps interrompidos (PC desligado no meio) não podem se acumular.
  const restos = (await readdir(pasta)).filter((n) => n.endsWith(PARCIAL));
  for (const resto of restos) {
    const info = await stat(join(pasta, resto)).catch(() => null);
    if (info && Date.now() - info.mtimeMs > UMA_HORA) {
      await unlink(join(pasta, resto)).catch(() => {});
    }
  }

  return apagaveis.length;
}

/** Backups existentes, do mais novo para o mais antigo. */
export async function listarBackups(): Promise<ArquivoBackup[]> {
  const pasta = pastaBackup();
  await mkdir(pasta, { recursive: true });

  const nomes = (await readdir(pasta)).filter((n) => n.startsWith(PREFIXO) && n.endsWith(SUFIXO));
  const arquivos = await Promise.all(
    nomes.map(async (arquivo) => {
      const info = await stat(join(pasta, arquivo));
      return { arquivo, criadoEm: info.mtime.toISOString(), bytes: info.size };
    }),
  );
  return arquivos.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
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
    const removidos = await limparAntigos();

    return { arquivo, criadoEm: info.mtime.toISOString(), bytes: info.size, via, removidos };
  } finally {
    rodando = false;
  }
}

/** Situação do backup, para a tela mostrar ("último backup: hoje 09:12"). */
export async function statusBackup() {
  const arquivos = await listarBackups();
  const ultimo = arquivos[0] ?? null;
  const atrasado = !ultimo || Date.now() - new Date(ultimo.criadoEm).getTime() > UM_DIA;

  return {
    ativo: env.BACKUP_ENABLED,
    pasta: pastaBackup(),
    retencaoDias: env.BACKUP_RETENCAO_DIAS,
    ultimo,
    atrasado,
    total: arquivos.length,
    arquivos: arquivos.slice(0, 10),
  };
}

// ---- Agendador ------------------------------------------------------------
// O PC da oficina fica desligado à noite, então agendar "todo dia às 2h" não
// funciona. A regra é por idade: se a cópia mais nova passou de 24h, faz outra.
// Vale no boot (pega o dia em que ficou desligado) e de hora em hora.

const INTERVALO_CHECAGEM = UMA_HORA;

async function backupSeAtrasado(log: (msg: string) => void) {
  try {
    const [ultimo] = await listarBackups();
    if (ultimo && Date.now() - new Date(ultimo.criadoEm).getTime() < UM_DIA) return;

    const feito = await gerarBackup();
    log(`💾 Backup do banco gerado: ${feito.arquivo} (${Math.round(feito.bytes / 1024)} KB, via ${feito.via})`);
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
