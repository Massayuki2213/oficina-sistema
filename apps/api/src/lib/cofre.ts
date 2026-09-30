import { createCipheriv, createDecipheriv, randomBytes, scrypt, type CipherGCM } from 'node:crypto';
import { open } from 'node:fs/promises';
import { Readable, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// ============================================================
// Backup criptografado (opcional, BACKUP_SENHA).
//
// A cópia que sai da oficina (pendrive, Google Drive) leva o banco
// inteiro: clientes, telefones, o caixa. Com BACKUP_SENHA, ela vai
// cifrada — quem achar o pendrive não lê nada sem a senha, que fica
// no servidor e no cofre do Dono, nunca junto da cópia.
//
// Formato do .sql.enc:
//   "HERMESBK1" | sal (16) | nonce (12) | dados (AES-256-GCM) | tag (16)
// A chave sai da senha pelo scrypt (lento de propósito: chute por força
// bruta fica caro). O GCM autentica: arquivo adulterado ou senha errada
// não "abre torto" — dá erro.
// ============================================================

const MAGICA = Buffer.from('HERMESBK1');
const TAM_SAL = 16;
const TAM_NONCE = 12;
const TAM_TAG = 16;
const CABECALHO = MAGICA.length + TAM_SAL + TAM_NONCE;

function derivarChave(senha: string, sal: Buffer): Promise<Buffer> {
  return new Promise((ok, falhou) =>
    scrypt(senha, sal, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, chave) => (err ? falhou(err) : ok(chave))),
  );
}

/** Prepara a cifra de um arquivo novo: o cabeçalho vai antes dos dados; a tag, no fim. */
export async function novaCifra(senha: string): Promise<{ cabecalho: Buffer; cifra: CipherGCM }> {
  const sal = randomBytes(TAM_SAL);
  const nonce = randomBytes(TAM_NONCE);
  const cifra = createCipheriv('aes-256-gcm', await derivarChave(senha, sal), nonce);
  return { cabecalho: Buffer.concat([MAGICA, sal, nonce]), cifra };
}

export class SenhaOuArquivoInvalido extends Error {}

/**
 * Abre um .sql.enc e escreve o SQL em `destino`. Senha errada ou arquivo
 * mexido: lança SenhaOuArquivoInvalido (o GCM confere a autenticidade no fim).
 */
export async function decifrarArquivo(caminho: string, senha: string, destino: Writable) {
  const arquivo = await open(caminho, 'r');
  try {
    const { size } = await arquivo.stat();
    if (size < CABECALHO + TAM_TAG) throw new SenhaOuArquivoInvalido('Arquivo pequeno demais para ser um backup cifrado do Hermes.');

    const cabecalho = Buffer.alloc(CABECALHO);
    await arquivo.read(cabecalho, 0, CABECALHO, 0);
    if (!cabecalho.subarray(0, MAGICA.length).equals(MAGICA)) {
      throw new SenhaOuArquivoInvalido('Este arquivo não é um backup cifrado do Hermes.');
    }
    const sal = cabecalho.subarray(MAGICA.length, MAGICA.length + TAM_SAL);
    const nonce = cabecalho.subarray(MAGICA.length + TAM_SAL);
    const tag = Buffer.alloc(TAM_TAG);
    await arquivo.read(tag, 0, TAM_TAG, size - TAM_TAG);

    const decifra = createDecipheriv('aes-256-gcm', await derivarChave(senha, sal), nonce);
    decifra.setAuthTag(tag);
    const dados = arquivo.createReadStream({ start: CABECALHO, end: size - TAM_TAG - 1, autoClose: false });
    try {
      await pipeline(dados, decifra, destino);
    } catch (err) {
      if (/auth|unable to authenticate/i.test((err as Error).message)) {
        throw new SenhaOuArquivoInvalido('Senha errada, ou o arquivo foi alterado/corrompido.');
      }
      throw err;
    }
  } finally {
    await arquivo.close();
  }
}

/** Cifra um buffer inteiro (testes e arquivos pequenos). */
export async function cifrarBuffer(senha: string, dados: Buffer): Promise<Buffer> {
  const { cabecalho, cifra } = await novaCifra(senha);
  const partes: Buffer[] = [cabecalho];
  await pipeline(Readable.from([dados]), cifra, async (fonte: AsyncIterable<Buffer>) => {
    for await (const parte of fonte) partes.push(parte);
  });
  return Buffer.concat([...partes, cifra.getAuthTag()]);
}
