import type { StatusParcela } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import type { ReceberParcelaInput } from './contas.schema.js';

const num = (v: unknown) => Number(v);
const round = (n: number) => Math.round(n * 100) / 100;

function inicioDeHoje() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDTO(c: any, hoje = inicioDeHoje()) {
  return {
    ...c,
    valor: num(c.valor),
    // RN-11.2: parcela pendente vencida = em atraso (calculado na hora).
    emAtraso: c.status === 'PENDENTE' && new Date(c.vencimento) < hoje,
  };
}

export async function listContas(filtros: { clienteId?: string; status?: StatusParcela; atrasadas?: boolean }) {
  const contas = await prisma.contaReceber.findMany({
    where: {
      ...(filtros.clienteId ? { clienteId: filtros.clienteId } : {}),
      ...(filtros.status ? { status: filtros.status } : {}),
    },
    orderBy: [{ status: 'asc' }, { vencimento: 'asc' }],
    include: {
      cliente: { select: { id: true, nome: true, telefone: true } },
      os: { select: { id: true, numero: true } },
    },
  });

  const hoje = inicioDeHoje();
  let dto = contas.map((c) => toDTO(c, hoje));
  if (filtros.atrasadas) dto = dto.filter((c) => c.emAtraso);

  const pendente = dto.filter((c) => c.status === 'PENDENTE').reduce((s, c) => s + c.valor, 0);
  const emAtraso = dto.filter((c) => c.emAtraso).reduce((s, c) => s + c.valor, 0);
  return { contas: dto, totais: { pendente: round(pendente), emAtraso: round(emAtraso) } };
}

// Resumo por cliente (RN-11.2): quem deve, quanto, e quem está em atraso.
export async function resumoPorCliente() {
  const contas = await prisma.contaReceber.findMany({
    where: { status: 'PENDENTE' },
    include: { cliente: { select: { id: true, nome: true, telefone: true } } },
  });

  const hoje = inicioDeHoje();
  const map = new Map<string, any>();
  for (const c of contas) {
    const atraso = new Date(c.vencimento) < hoje;
    const cur = map.get(c.clienteId) ?? { cliente: c.cliente, totalDevido: 0, emAtraso: 0, parcelasAbertas: 0, temAtraso: false };
    cur.totalDevido += num(c.valor);
    cur.parcelasAbertas += 1;
    if (atraso) {
      cur.emAtraso += num(c.valor);
      cur.temAtraso = true;
    }
    map.set(c.clienteId, cur);
  }

  const clientes = [...map.values()]
    .map((c) => ({ ...c, totalDevido: round(c.totalDevido), emAtraso: round(c.emAtraso) }))
    .sort((a, b) => b.emAtraso - a.emAtraso || b.totalDevido - a.totalDevido);

  return {
    totalReceber: round(clientes.reduce((s, c) => s + c.totalDevido, 0)),
    totalEmAtraso: round(clientes.reduce((s, c) => s + c.emAtraso, 0)),
    clientes,
  };
}

// Dá baixa numa parcela: quita e lança a entrada no caixa (RN-11.1).
export async function receberParcela(id: string, input: ReceberParcelaInput, usuarioId: string) {
  const conta = await prisma.contaReceber.findUnique({ where: { id }, include: { cliente: true, os: true } });
  if (!conta) throw new AppError(404, 'Parcela não encontrada');
  if (conta.status === 'PAGA') throw new AppError(409, 'Esta parcela já foi recebida');

  const descricao =
    `Parcela ${conta.parcela}/${conta.totalParcelas}` +
    (conta.os ? ` — OS #${conta.os.numero}` : '') +
    ` — ${conta.cliente.nome}`;

  const atualizada = await prisma.$transaction(async (tx) => {
    const upd = await tx.contaReceber.update({ where: { id }, data: { status: 'PAGA', pagoEm: new Date() } });
    // osId fica null de propósito: várias parcelas da mesma OS não podem
    // dividir o mesmo lançamento (osId é único em lancamentos_caixa).
    await tx.lancamentoCaixa.create({
      data: {
        tipo: 'ENTRADA',
        origem: 'OS',
        descricao,
        valor: upd.valor,
        formaPagamento: input.formaPagamento,
        categoria: 'Contas a Receber',
        usuarioId,
      },
    });
    return upd;
  });

  return toDTO(atualizada);
}
