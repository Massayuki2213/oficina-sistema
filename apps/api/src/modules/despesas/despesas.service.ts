import type { Prisma, Despesa } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import type { CreateDespesaInput, UpdateDespesaInput } from './despesas.schema.js';

const num = (v: unknown) => Number(v);
const round = (n: number) => Math.round(n * 100) / 100;
const toDTO = (d: any) => ({ ...d, valor: num(d.valor) });

function intervalo(de?: string, ate?: string) {
  const gte = de ? new Date(de + 'T00:00:00') : undefined;
  const lte = ate ? new Date(ate + 'T23:59:59.999') : undefined;
  if (!gte && !lte) return {};
  return { data: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } };
}

// RN-12: uma despesa paga vira saída no livro-caixa.
async function lancarSaidaNoCaixa(tx: Prisma.TransactionClient, despesa: Despesa, usuarioId: string) {
  await tx.lancamentoCaixa.create({
    data: {
      tipo: 'SAIDA',
      origem: 'DESPESA',
      descricao: despesa.descricao,
      valor: despesa.valor,
      categoria: despesa.categoria,
      usuarioId,
    },
  });
}

export async function listDespesas(de?: string, ate?: string, categoria?: string) {
  const despesas = await prisma.despesa.findMany({
    where: {
      ...intervalo(de, ate),
      ...(categoria ? { categoria: { contains: categoria, mode: 'insensitive' } } : {}),
    },
    orderBy: { data: 'desc' },
    include: { fornecedor: { select: { id: true, nome: true } } },
  });

  const total = despesas.reduce((s, d) => s + num(d.valor), 0);
  const pago = despesas.filter((d) => d.pago).reduce((s, d) => s + num(d.valor), 0);
  return {
    despesas: despesas.map(toDTO),
    totais: { total: round(total), pago: round(pago), aPagar: round(total - pago) },
  };
}

export async function getDespesa(id: string) {
  const d = await prisma.despesa.findUnique({ where: { id }, include: { fornecedor: true } });
  return d ? toDTO(d) : null;
}

export async function createDespesa(input: CreateDespesaInput, usuarioId: string) {
  const data = input.data ? new Date(input.data + 'T12:00:00') : undefined;

  const despesa = await prisma.$transaction(async (tx) => {
    const d = await tx.despesa.create({
      data: {
        categoria: input.categoria,
        descricao: input.descricao,
        valor: input.valor,
        fornecedorId: input.fornecedorId ?? null,
        recorrente: input.recorrente,
        pago: input.pago,
        ...(data ? { data } : {}),
      },
    });
    if (d.pago) await lancarSaidaNoCaixa(tx, d, usuarioId); // já nasceu paga → sai do caixa
    return d;
  });

  return toDTO(despesa);
}

// Paga uma despesa pendente e lança a saída no caixa (RN-12).
export async function pagarDespesa(id: string, usuarioId: string) {
  const d = await prisma.despesa.findUnique({ where: { id } });
  if (!d) throw new AppError(404, 'Despesa não encontrada');
  if (d.pago) throw new AppError(409, 'Esta despesa já está paga');

  const atualizada = await prisma.$transaction(async (tx) => {
    const upd = await tx.despesa.update({ where: { id }, data: { pago: true } });
    await lancarSaidaNoCaixa(tx, upd, usuarioId);
    return upd;
  });
  return toDTO(atualizada);
}

export async function updateDespesa(id: string, input: UpdateDespesaInput) {
  const { data, ...rest } = input;
  try {
    const d = await prisma.despesa.update({
      where: { id },
      data: { ...rest, ...(data ? { data: new Date(data + 'T12:00:00') } : {}) },
    });
    return toDTO(d);
  } catch {
    throw new AppError(404, 'Despesa não encontrada');
  }
}

export async function deleteDespesa(id: string) {
  const d = await prisma.despesa.findUnique({ where: { id } });
  if (!d) throw new AppError(404, 'Despesa não encontrada');
  // Uma despesa paga já virou saída no caixa; apagá-la deixaria o caixa inconsistente.
  if (d.pago) throw new AppError(400, 'Despesa paga não pode ser apagada (já entrou no caixa)');
  await prisma.despesa.delete({ where: { id } });
}
