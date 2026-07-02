import { prisma } from '../../lib/prisma.js';
import type { LancamentoInput } from './caixa.schema.js';

const num = (v: unknown) => Number(v);
const round = (n: number) => Math.round(n * 100) / 100;
const toDTO = (l: any) => ({ ...l, valor: num(l.valor) });

function intervalo(de?: string, ate?: string) {
  const gte = de ? new Date(de + 'T00:00:00') : undefined;
  const lte = ate ? new Date(ate + 'T23:59:59.999') : undefined;
  if (!gte && !lte) return {};
  return { data: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } };
}

function totais(lancamentos: { tipo: string; valor: unknown }[]) {
  const entradas = lancamentos.filter((l) => l.tipo === 'ENTRADA').reduce((s, l) => s + num(l.valor), 0);
  const saidas = lancamentos.filter((l) => l.tipo === 'SAIDA').reduce((s, l) => s + num(l.valor), 0);
  return { entradas: round(entradas), saidas: round(saidas), saldo: round(entradas - saidas) };
}

// Lista os lançamentos do período com os totais (entradas, saídas, saldo).
export async function listCaixa(de?: string, ate?: string) {
  const lancamentos = await prisma.lancamentoCaixa.findMany({
    where: intervalo(de, ate),
    orderBy: { data: 'desc' },
    include: { usuario: { select: { id: true, nome: true } } },
  });
  return { lancamentos: lancamentos.map(toDTO), totais: totais(lancamentos) };
}

// Fechamento do dia (RN-15): totais e quebra por forma de pagamento.
export async function resumoDia(dataStr?: string) {
  const base = dataStr ? new Date(dataStr + 'T00:00:00') : new Date();
  const inicio = new Date(base);
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(base);
  fim.setHours(23, 59, 59, 999);

  const lancamentos = await prisma.lancamentoCaixa.findMany({ where: { data: { gte: inicio, lte: fim } } });

  const porFormaPagamento: Record<string, number> = {};
  for (const l of lancamentos) {
    if (l.tipo !== 'ENTRADA') continue;
    const f = l.formaPagamento ?? 'OUTRO';
    porFormaPagamento[f] = round((porFormaPagamento[f] ?? 0) + num(l.valor));
  }

  return {
    data: inicio.toISOString().slice(0, 10),
    quantidade: lancamentos.length,
    ...totais(lancamentos),
    porFormaPagamento,
  };
}

export async function criarLancamento(input: LancamentoInput, usuarioId: string) {
  const origem = input.origem ?? (input.tipo === 'ENTRADA' ? 'APORTE' : 'DESPESA');
  const lancamento = await prisma.lancamentoCaixa.create({
    data: {
      tipo: input.tipo,
      origem,
      descricao: input.descricao,
      valor: input.valor,
      formaPagamento: input.formaPagamento ?? null,
      categoria: input.categoria ?? null,
      usuarioId,
    },
  });
  return toDTO(lancamento);
}
