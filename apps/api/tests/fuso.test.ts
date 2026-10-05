import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { dataLocal, paraDataISO } from '../src/lib/datas.js';
import * as caixa from '../src/modules/caixa/caixa.service.js';
import * as relatorios from '../src/modules/relatorios/relatorios.service.js';
import { db, limparDominio, configPadrao } from './ajuda.js';

// ============================================================
// Fuso da oficina (America/Sao_Paulo) contra os horários gravados
// em UTC. Às 22h30 em Brasília já é o dia seguinte em UTC — e o
// lançamento tem que cair no dia, e no mês, da oficina: é o que o
// fechamento do caixa e os relatórios mostram ao Dono.
// ============================================================

const DIA = 24 * 60 * 60 * 1000;
const diaSeguinte = (iso: string) => paraDataISO(new Date(dataLocal(iso).getTime() + DIA));

/** Último dia do mês passado — sempre dentro dos 12 meses da evolução. */
function ultimoDiaDoMesPassado() {
  const hoje = new Date();
  return paraDataISO(new Date(hoje.getFullYear(), hoje.getMonth(), 0));
}

const receitaAs = (iso: string, hora: number, minuto: number, valor = 100) =>
  db.lancamentoCaixa.create({
    data: { tipo: 'ENTRADA', origem: 'OS', descricao: 'teste de fuso', valor, formaPagamento: 'PIX', data: dataLocal(iso, hora, minuto) },
  });

beforeEach(async () => {
  await limparDominio();
  await configPadrao();
});
afterAll(async () => {
  await db.$disconnect();
});

describe('fuso da oficina', () => {
  it('API e banco rodam em America/Sao_Paulo, como na oficina', async () => {
    expect(process.env.TZ).toBe('America/Sao_Paulo');
    const [{ fuso }] = await prisma.$queryRaw<{ fuso: string }[]>`SELECT current_setting('TimeZone') AS fuso`;
    expect(fuso).toBe('America/Sao_Paulo');
  });

  it('lançamento às 22h30 é do dia da oficina — não do dia seguinte, que já é o de UTC', async () => {
    const dia = '2026-09-15';
    const l = await receitaAs(dia, 22, 30);
    // Gravado em UTC: no banco, já é madrugada do dia seguinte.
    expect(l.data.toISOString()).toBe('2026-09-16T01:30:00.000Z');

    expect((await caixa.resumoDia(dia)).entradas).toBe(100);
    expect((await caixa.resumoDia(diaSeguinte(dia))).entradas).toBe(0);
  });

  it('e às 00h30 já é o dia seguinte', async () => {
    await receitaAs('2026-09-16', 0, 30);
    expect((await caixa.resumoDia('2026-09-15')).entradas).toBe(0);
    expect((await caixa.resumoDia('2026-09-16')).entradas).toBe(100);
  });

  it('relatório do mês: 22h30 do último dia conta no mês certo (resumo e evolução de 12 meses)', async () => {
    const ultimo = ultimoDiaDoMesPassado();
    const mes = ultimo.slice(0, 7);
    const mesSeguinte = diaSeguinte(ultimo).slice(0, 7);
    await receitaAs(ultimo, 22, 30, 250);

    expect((await relatorios.resumo({ de: `${mes}-01`, ate: ultimo })).faturamento).toBe(250);
    expect((await relatorios.resumo({ de: `${mesSeguinte}-01`, ate: diaSeguinte(ultimo) })).faturamento).toBe(0);

    const { meses } = await relatorios.evolucao(12);
    expect(meses.find((m) => m.mes === mes)?.faturamento).toBe(250);
    expect(meses.find((m) => m.mes === mesSeguinte)?.faturamento ?? 0).toBe(0);
  });

  it('registro criado agora fica com a hora de agora (o fuso do banco não desloca nada)', async () => {
    const antes = Date.now();
    const l = await prisma.lancamentoCaixa.create({ data: { tipo: 'ENTRADA', origem: 'APORTE', descricao: 'agora', valor: 1 } });
    expect(Math.abs(l.data.getTime() - antes)).toBeLessThan(60_000);
  });
});
