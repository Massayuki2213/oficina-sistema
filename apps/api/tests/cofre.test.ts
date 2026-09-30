import { describe, it, expect, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { cifrarBuffer, decifrarArquivo, SenhaOuArquivoInvalido } from '../src/lib/cofre.js';

// Backup cifrado: sem a senha, o arquivo não diz nada; com a senha errada ou
// um byte mexido, não "abre torto" — recusa.

const SENHA = 'senha-das-copias-2026';
const SQL = Buffer.from("-- PostgreSQL database dump\nINSERT INTO clientes VALUES ('Dona Maria', '11999990000');\n".repeat(200));
const pastas: string[] = [];

async function arquivoCom(conteudo: Buffer) {
  const pasta = await mkdtemp(join(tmpdir(), 'hermes-cofre-'));
  pastas.push(pasta);
  const caminho = join(pasta, 'hermes-2026-09-30_120000.sql.enc');
  await writeFile(caminho, conteudo);
  return caminho;
}

async function abrir(caminho: string, senha: string) {
  const partes: Buffer[] = [];
  const saida = new PassThrough();
  saida.on('data', (p: Buffer) => partes.push(p));
  await decifrarArquivo(caminho, senha, saida);
  return Buffer.concat(partes);
}

afterAll(async () => {
  for (const p of pastas) await rm(p, { recursive: true, force: true });
});

describe('backup cifrado', () => {
  it('com a senha certa, volta exatamente o SQL', async () => {
    const caminho = await arquivoCom(await cifrarBuffer(SENHA, SQL));
    expect((await abrir(caminho, SENHA)).equals(SQL)).toBe(true);
  });

  it('o arquivo não deixa ler nada do conteúdo', async () => {
    const cifrado = await cifrarBuffer(SENHA, SQL);
    expect(cifrado.includes(Buffer.from('Dona Maria'))).toBe(false);
    expect(cifrado.includes(Buffer.from('PostgreSQL'))).toBe(false);
  });

  it('senha errada: recusa', async () => {
    const caminho = await arquivoCom(await cifrarBuffer(SENHA, SQL));
    await expect(abrir(caminho, 'senha-errada-qualquer')).rejects.toBeInstanceOf(SenhaOuArquivoInvalido);
  });

  it('um byte mexido no meio: recusa (não entrega SQL adulterado)', async () => {
    const cifrado = await cifrarBuffer(SENHA, SQL);
    cifrado[Math.floor(cifrado.length / 2)] ^= 0xff;
    await expect(abrir(await arquivoCom(cifrado), SENHA)).rejects.toBeInstanceOf(SenhaOuArquivoInvalido);
  });

  it('arquivo que não é backup do Hermes: diz isso', async () => {
    const caminho = await arquivoCom(Buffer.from('-- um .sql qualquer, sem cifra\nSELECT 1;\n'.repeat(5)));
    await expect(abrir(caminho, SENHA)).rejects.toThrow(/não é um backup cifrado do Hermes/);
  });

  it('cada cópia tem sal e nonce próprios: o mesmo SQL nunca gera o mesmo arquivo', async () => {
    const [a, b] = await Promise.all([cifrarBuffer(SENHA, SQL), cifrarBuffer(SENHA, SQL)]);
    expect(a.equals(b)).toBe(false);
  });
});
