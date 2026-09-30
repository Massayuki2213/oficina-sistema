import type { Prisma } from '@prisma/client';
import type { ParcelaDTO } from '@hermes/shared';
import { num } from '../../lib/dinheiro.js';
import { inicioDoDia, isoOuNull } from '../../lib/datas.js';
import { saldoParcela } from '../../dominio/fiado.js';

export const incluirParcela = {
  cliente: { select: { id: true, nome: true, telefone: true, whatsapp: true } },
  os: { select: { id: true, numero: true } },
} satisfies Prisma.ContaReceberInclude;

type ParcelaCompleta = Prisma.ContaReceberGetPayload<{ include: typeof incluirParcela }>;

export function paraParcela(c: ParcelaCompleta, hoje = inicioDoDia()): ParcelaDTO {
  return {
    id: c.id,
    parcela: c.parcela,
    totalParcelas: c.totalParcelas,
    descricao: c.descricao,
    vencimento: c.vencimento.toISOString(),
    valor: num(c.valor),
    valorPago: num(c.valorPago),
    saldo: saldoParcela(c),
    status: c.status,
    // RN-11.2: pendente e vencida antes de hoje = em atraso (calculado na hora).
    emAtraso: c.status === 'PENDENTE' && c.vencimento < hoje,
    pagoEm: isoOuNull(c.pagoEm),
    cliente: c.cliente,
    os: c.os,
  };
}
