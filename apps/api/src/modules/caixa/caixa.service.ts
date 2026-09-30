import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { LancamentoDTO, ListaCaixaDTO, ResumoDiaDTO, UsuarioSessao } from '@hermes/shared';
import type { lancamentoSchema, listarCaixaQuery } from '@hermes/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { num, somar, subtrair } from '../../lib/dinheiro.js';
import { dataLocal, fimDoDia, hojeISO, inicioDoDia, intervalo, paraDataISO } from '../../lib/datas.js';
import { pagina, paginar } from '../../lib/paginacao.js';
import { lancar } from '../../dominio/caixa.js';

const incluirRel = {
  usuario: { select: { nome: true } },
  os: { select: { id: true, numero: true } },
} satisfies Prisma.LancamentoCaixaInclude;

type LancamentoCompleto = Prisma.LancamentoCaixaGetPayload<{ include: typeof incluirRel }>;

export function paraLancamentoDTO(l: LancamentoCompleto): LancamentoDTO {
  return {
    id: l.id,
    data: l.data.toISOString(),
    tipo: l.tipo,
    origem: l.origem,
    descricao: l.descricao,
    valor: num(l.valor),
    formaPagamento: l.formaPagamento,
    categoria: l.categoria,
    usuario: l.usuario?.nome ?? null,
    os: l.os,
  };
}

/** Soma entradas e saídas de um filtro inteiro (não só da página). */
async function totaisDe(where: Prisma.LancamentoCaixaWhereInput) {
  const grupos = await prisma.lancamentoCaixa.groupBy({ by: ['tipo'], where, _sum: { valor: true } });
  const entradas = num(grupos.find((g) => g.tipo === 'ENTRADA')?._sum.valor);
  const saidas = num(grupos.find((g) => g.tipo === 'SAIDA')?._sum.valor);
  return { entradas, saidas, saldo: subtrair(entradas, saidas) };
}

export async function listar(q: z.output<typeof listarCaixaQuery>): Promise<ListaCaixaDTO> {
  const periodo = intervalo(q.de, q.ate);
  const where: Prisma.LancamentoCaixaWhereInput = {
    ...(periodo ? { data: periodo } : {}),
    ...(q.tipo ? { tipo: q.tipo } : {}),
    ...(q.origem ? { origem: q.origem } : {}),
    ...(q.busca ? { descricao: { contains: q.busca, mode: 'insensitive' } } : {}),
  };
  const [itens, total, totais] = await Promise.all([
    prisma.lancamentoCaixa.findMany({ where, orderBy: [{ data: 'desc' }, { id: 'desc' }], include: incluirRel, ...paginar(q) }),
    prisma.lancamentoCaixa.count({ where }),
    totaisDe(where),
  ]);
  return { ...pagina(itens.map(paraLancamentoDTO), total, q), totais };
}

/**
 * RN-15 — fechamento do dia: quanto havia, quanto entrou (por forma, para
 * conferir a gaveta, o PIX e a maquininha), quanto saiu e o saldo final.
 */
export async function resumoDia(dataISO = hojeISO()): Promise<ResumoDiaDTO> {
  const inicio = inicioDoDia(dataISO);
  const fim = fimDoDia(dataISO);

  const [anterior, lancamentos] = await Promise.all([
    totaisDe({ data: { lt: inicio } }),
    prisma.lancamentoCaixa.findMany({
      where: { data: { gte: inicio, lte: fim } },
      orderBy: { data: 'asc' },
      include: incluirRel,
    }),
  ]);

  const porForma = (tipo: 'ENTRADA' | 'SAIDA') => {
    const mapa: Record<string, number> = {};
    for (const l of lancamentos.filter((x) => x.tipo === tipo)) {
      const forma = l.formaPagamento ?? 'OUTRA';
      mapa[forma] = somar(mapa[forma] ?? 0, num(l.valor));
    }
    return mapa;
  };

  const entradas = somar(...lancamentos.filter((l) => l.tipo === 'ENTRADA').map((l) => num(l.valor)));
  const saidas = somar(...lancamentos.filter((l) => l.tipo === 'SAIDA').map((l) => num(l.valor)));

  return {
    data: paraDataISO(inicio),
    saldoAnterior: anterior.saldo,
    entradas,
    saidas,
    saldoFinal: subtrair(somar(anterior.saldo, entradas), saidas),
    entradasPorForma: porForma('ENTRADA'),
    saidasPorForma: porForma('SAIDA'),
    lancamentos: lancamentos.map(paraLancamentoDTO),
  };
}

/** Lançamento manual: aporte, retirada, venda avulsa, despesa miúda. */
export async function criar(dados: z.output<typeof lancamentoSchema>, ator: UsuarioSessao): Promise<LancamentoDTO> {
  // Data informada e diferente de hoje: meio-dia daquela data (evita virar o dia em outro fuso).
  const data = dados.data && dados.data !== hojeISO() ? dataLocal(dados.data) : undefined;
  const l = await prisma.$transaction((tx) =>
    lancar(tx, {
      tipo: dados.tipo,
      origem: dados.origem,
      descricao: dados.descricao,
      valor: dados.valor,
      formaPagamento: dados.formaPagamento ?? null,
      categoria: dados.categoria ?? null,
      data,
      usuarioId: ator.id,
    }),
  );
  const completo = await prisma.lancamentoCaixa.findUniqueOrThrow({ where: { id: l.id }, include: incluirRel });
  return paraLancamentoDTO(completo);
}
