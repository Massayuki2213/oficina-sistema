import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from '../src/lib/env.js';
import {
  MARCA_HD,
  alertaDeBackup,
  enviarAoHd,
  iniciarAgendadorDeBackup,
  listarPasta,
  podarPasta,
  statusBackup,
} from '../src/modules/backup/backup.service.js';
import * as alertas from '../src/modules/alertas/alertas.service.js';
import { atores, DIA } from './ajuda.js';

// Segunda cópia do backup no HD externo. O HD só conta se tiver o arquivo-marca:
// desconectado, o ponto de montagem é uma pasta vazia no SSD, e gravar ali
// daria a impressão de cópia externa sem haver nenhuma.

const HORA = 60 * 60 * 1000;
const original = { ...env };
let base: string;
let ssd: string;
let hd: string;

/** Uma cópia com a idade pedida (a data do arquivo é o que conta). */
async function copia(pasta: string, nome: string, idadeMs: number, conteudo: Buffer | string = 'SELECT 1;\n') {
  const caminho = join(pasta, nome);
  await writeFile(caminho, conteudo);
  const quando = new Date(Date.now() - idadeMs);
  await utimes(caminho, quando, quando);
  return caminho;
}

const conectarHd = () => writeFile(join(hd, MARCA_HD), 'HD de backup do Hermes\n');
const nomes = async (pasta: string) => (await readdir(pasta)).sort();

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'hermes-hd-'));
  ssd = join(base, 'ssd');
  hd = join(base, 'hd');
  await mkdir(ssd);
  await mkdir(hd);
  Object.assign(env, { BACKUP_ENABLED: true, BACKUP_DIR: ssd, BACKUP_DIR_EXTERNO: hd, BACKUP_RETENCAO_DIAS_EXTERNO: 60 });
});

afterEach(async () => {
  Object.assign(env, original);
  await rm(base, { recursive: true, force: true });
});

describe('cópia no HD externo', () => {
  it('sem o arquivo-marca, o HD conta como desconectado e nada é gravado', async () => {
    const origem = await copia(ssd, 'hermes-2026-10-05_090000.sql', 0);
    expect(await enviarAoHd(origem, 'hermes-2026-10-05_090000.sql', hd, 60)).toBe('ausente');
    expect(await readdir(hd)).toEqual([]);
  });

  it('com a marca, a cópia chega inteira e sem sobra de .parcial', async () => {
    const conteudo = randomBytes(300_000);
    const origem = await copia(ssd, 'hermes-2026-10-05_090000.sql', 0, conteudo);
    await conectarHd();

    expect(await enviarAoHd(origem, 'hermes-2026-10-05_090000.sql', hd, 60)).toBe('ok');
    expect(await nomes(hd)).toEqual([MARCA_HD, 'hermes-2026-10-05_090000.sql'].sort());
    expect((await readFile(join(hd, 'hermes-2026-10-05_090000.sql'))).equals(conteudo)).toBe(true);
  });

  it('cópia que já está no HD não é gravada de novo', async () => {
    const origem = await copia(ssd, 'hermes-2026-10-05_090000.sql', 0);
    await conectarHd();
    const noHd = await copia(hd, 'hermes-2026-10-05_090000.sql', DIA);
    const antes = (await stat(noHd)).mtimeMs;

    expect(await enviarAoHd(origem, 'hermes-2026-10-05_090000.sql', hd, 60)).toBe('ok');
    expect((await stat(noHd)).mtimeMs).toBe(antes);
  });
});

describe('retenção', () => {
  it('no HD: apaga o que passou de 60 dias, mas nunca fica com menos de 3 cópias', async () => {
    await copia(hd, 'hermes-2026-07-27_090000.sql', 70 * DIA);
    await copia(hd, 'hermes-2026-08-01_090000.sql', 65 * DIA);
    await copia(hd, 'hermes-2026-08-05_090000.sql', 61 * DIA);
    await copia(hd, 'hermes-2026-09-25_090000.sql', 10 * DIA);
    await copia(hd, 'hermes-2026-10-04_090000.sql', 1 * DIA);

    expect(await podarPasta(hd, 60)).toBe(2);
    // A de 61 dias fica: é uma das 3 mais novas.
    expect((await listarPasta(hd)).map((a) => a.arquivo)).toEqual([
      'hermes-2026-10-04_090000.sql',
      'hermes-2026-09-25_090000.sql',
      'hermes-2026-08-05_090000.sql',
    ]);
  });

  it('resto de cópia interrompida (.parcial) some depois de 1 hora; a que está em andamento fica', async () => {
    await copia(hd, 'hermes-2026-10-05_070000.sql.parcial', 2 * HORA);
    await copia(hd, 'hermes-2026-10-05_090000.sql.parcial', 5 * 60 * 1000);

    await podarPasta(hd, 60);
    expect(await nomes(hd)).toEqual(['hermes-2026-10-05_090000.sql.parcial']);
  });
});

describe('situação na tela de backup', () => {
  it('sem HD configurado, não há bloco de HD', async () => {
    env.BACKUP_DIR_EXTERNO = undefined;
    expect((await statusBackup()).hdExterno).toBeNull();
  });

  it('HD conectado: quantas cópias, a mais nova, a retenção e o espaço livre', async () => {
    await conectarHd();
    await copia(hd, 'hermes-2026-10-03_090000.sql', 2 * DIA);
    await copia(hd, 'hermes-2026-10-05_090000.sql', HORA);

    const { hdExterno } = await statusBackup();
    expect(hdExterno).toMatchObject({ montado: true, total: 2, retencaoDias: 60, erro: null });
    expect(hdExterno?.ultimo?.arquivo).toBe('hermes-2026-10-05_090000.sql');
    expect(hdExterno?.livreBytes).toBeGreaterThan(0);
  });

  it('HD desconectado: não lista o que sobrou na pasta do ponto de montagem', async () => {
    await copia(hd, 'hermes-2026-10-05_090000.sql', HORA);
    expect((await statusBackup()).hdExterno).toMatchObject({ montado: false, total: 0, ultimo: null, livreBytes: null });
  });
});

describe('aviso no painel do Dono', () => {
  it('backup em dia e HD conectado: nenhum aviso', async () => {
    await copia(ssd, 'hermes-2026-10-05_090000.sql', HORA);
    await conectarHd();
    expect(await alertaDeBackup()).toBeNull();
  });

  it('última cópia com mais de 24 h: avisa e diz de quando ela é', async () => {
    const caminho = await copia(ssd, 'hermes-2026-10-04_080000.sql', 25 * HORA);
    await conectarHd();
    expect(await alertaDeBackup()).toEqual({
      atrasado: true,
      ultimoEm: (await stat(caminho)).mtime.toISOString(),
      hdAusente: false,
      hdErro: null,
    });
  });

  it('nenhuma cópia ainda: avisa', async () => {
    await conectarHd();
    expect(await alertaDeBackup()).toMatchObject({ atrasado: true, ultimoEm: null });
  });

  it('HD desconectado: avisa mesmo com o backup em dia', async () => {
    await copia(ssd, 'hermes-2026-10-05_090000.sql', HORA);
    expect(await alertaDeBackup()).toMatchObject({ atrasado: false, hdAusente: true });
  });

  it('sem HD configurado, não cobra o HD', async () => {
    await copia(ssd, 'hermes-2026-10-05_090000.sql', HORA);
    env.BACKUP_DIR_EXTERNO = undefined;
    expect(await alertaDeBackup()).toBeNull();
  });

  it('backup automático desligado: nenhum aviso', async () => {
    env.BACKUP_ENABLED = false;
    expect(await alertaDeBackup()).toBeNull();
  });

  it('só o Dono recebe o aviso: é ele quem resolve', async () => {
    const { dono, atendente, mecanico } = await atores();
    expect((await alertas.todos(dono)).backup).toMatchObject({ atrasado: true });
    expect((await alertas.todos(atendente)).backup).toBeNull();
    expect((await alertas.todos(mecanico)).backup).toBeNull();
  });
});

describe('agendador: HD que volta depois', () => {
  it('leva a cópia do dia quando o HD é conectado; a falha de gravação aparece e some', async () => {
    await copia(ssd, 'hermes-2026-10-05_080000.sql', 2 * HORA);
    const logs: string[] = [];
    const quantos = (trecho: string) => logs.filter((l) => l.includes(trecho)).length;

    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
    const parar = iniciarAgendadorDeBackup((msg) => logs.push(msg));
    try {
      // Boot sem o HD: avisa uma vez só, mesmo checando de novo uma hora depois.
      await vi.advanceTimersByTimeAsync(15_000);
      await vi.waitFor(() => expect(quantos('não está montado')).toBe(1));
      await vi.advanceTimersByTimeAsync(HORA);
      expect(await alertaDeBackup()).toMatchObject({ hdAusente: true });
      expect(quantos('não está montado')).toBe(1);

      // O HD volta: a cópia do dia vai para lá na checagem seguinte.
      await conectarHd();
      await vi.advanceTimersByTimeAsync(HORA);
      await vi.waitFor(() => expect(existsSync(join(hd, 'hermes-2026-10-05_080000.sql'))).toBe(true));
      await vi.waitFor(() => expect(quantos('HD externo montado')).toBe(1));
      expect(await alertaDeBackup()).toBeNull();

      // Uma cópia nova que não consegue ser gravada no HD: o Dono fica sabendo.
      await copia(ssd, 'hermes-2026-10-05_100000.sql', 0);
      await mkdir(join(hd, 'hermes-2026-10-05_100000.sql.parcial'));
      await vi.advanceTimersByTimeAsync(HORA);
      await vi.waitFor(() => expect(quantos('Não consegui gravar no HD')).toBe(1));
      expect((await alertaDeBackup())?.hdErro).toBeTruthy();
      expect((await statusBackup()).hdExterno?.erro).toBeTruthy();

      // Resolvido o problema, a próxima checagem grava e o aviso some.
      await rm(join(hd, 'hermes-2026-10-05_100000.sql.parcial'), { recursive: true });
      await vi.advanceTimersByTimeAsync(HORA);
      await vi.waitFor(() => expect(existsSync(join(hd, 'hermes-2026-10-05_100000.sql'))).toBe(true));
      await vi.waitFor(async () => expect(await alertaDeBackup()).toBeNull());
    } finally {
      parar();
      vi.useRealTimers();
    }
  });
});
