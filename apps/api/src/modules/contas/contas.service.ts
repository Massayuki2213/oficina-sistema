import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { DevedorDTO, ListaContasDTO, ParcelaDTO, ResumoDevedoresDTO, UsuarioSessao } from '@hermes/shared';
import type { lancarFiadoSchema, listarContasQuery, receberParcelaSchema } from '@hermes/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { conflito, invalido, naoEncontrado } from '../../lib/errors.js';
import { brl, num, somar, subtrair } from '../../lib/dinheiro.js';
import { inicioDoDia } from '../../lib/datas.js';
import { pagina, paginar } from '../../lib/paginacao.js';
import { lancar } from '../../dominio/caixa.js';
import { atualizarQuitacaoDaOS, gerarParcelas, saldoParcela } from '../../dominio/fiado.js';
import { incluirParcela, paraParcela } from './contas.mapper.js';

// ============================================================
// Contas a Receber — o fiado e o parcelado (RN-11.1 / RN-11.2).
// Cada valor recebido entra no caixa na hora; a parcela aceita
// baixa parcial ("deu 100 dos 350 hoje").
// ============================================================

/** Soma o saldo (valor − pago) das parcelas pendentes de um filtro inteiro. */
async function saldoDe(where: Prisma.ContaReceberWhereInput) {
  const s = await prisma.contaReceber.aggregate({
    where: { ...where, status: 'PENDENTE' },
    _sum: { valor: true, valorPago: true },
  });
  return subtrair(num(s._sum.valor), num(s._sum.valorPago));
}

export async function listar(q: z.output<typeof listarContasQuery>): Promise<ListaContasDTO> {
  const hoje = inicioDoDia();
  const where: Prisma.ContaReceberWhereInput = {
    ...(q.clienteId ? { clienteId: q.clienteId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.atrasadas ? { status: 'PENDENTE', vencimento: { lt: hoje } } : {}),
    ...(q.busca ? { cliente: { nome: { contains: q.busca, mode: 'insensitive' } } } : {}),
  };

  const [itens, total, pendente, emAtraso] = await Promise.all([
    prisma.contaReceber.findMany({
      where,
      // Pendentes primeiro, pela ordem de vencimento — é a fila de cobrança.
      orderBy: [{ status: 'asc' }, { vencimento: 'asc' }],
      include: incluirParcela,
      ...paginar(q),
    }),
    prisma.contaReceber.count({ where }),
    saldoDe(where),
    saldoDe({ ...where, vencimento: { lt: hoje } }),
  ]);

  return {
    ...pagina(
      itens.map((c) => paraParcela(c, hoje)),
      total,
      q,
    ),
    totais: { pendente, emAtraso },
  };
}

/** Quem deve, quanto e quem está em atraso (RN-11.2) — ordenado por quem mais preocupa. */
export async function resumo(): Promise<ResumoDevedoresDTO> {
  const hoje = inicioDoDia();
  const pendentes = await prisma.contaReceber.findMany({
    where: { status: 'PENDENTE' },
    include: { cliente: { select: { id: true, nome: true, telefone: true, whatsapp: true } } },
  });

  const porCliente = new Map<string, DevedorDTO>();
  for (const c of pendentes) {
    const saldo = saldoParcela(c);
    const atual = porCliente.get(c.clienteId) ?? {
      cliente: c.cliente,
      totalDevido: 0,
      emAtraso: 0,
      parcelasAbertas: 0,
      temAtraso: false,
    };
    atual.totalDevido = somar(atual.totalDevido, saldo);
    atual.parcelasAbertas += 1;
    if (c.vencimento < hoje) {
      atual.emAtraso = somar(atual.emAtraso, saldo);
      atual.temAtraso = true;
    }
    porCliente.set(c.clienteId, atual);
  }

  const clientes = [...porCliente.values()].sort((a, b) => b.emAtraso - a.emAtraso || b.totalDevido - a.totalDevido);
  return {
    totalReceber: somar(...clientes.map((c) => c.totalDevido)),
    totalEmAtraso: somar(...clientes.map((c) => c.emAtraso)),
    clientes,
  };
}

/**
 * Baixa de parcela (RN-11.1): o valor entra no caixa na hora, ligado à
 * parcela e à OS. Sem valor informado, quita o saldo; com valor menor,
 * baixa parcial. Quitada a última parcela, a OS passa a constar como paga.
 */
export async function receber(id: string, dados: z.output<typeof receberParcelaSchema>, ator: UsuarioSessao): Promise<ParcelaDTO> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM contas_receber WHERE id = ${id} FOR UPDATE`;
    const c = await tx.contaReceber.findUnique({ where: { id }, include: incluirParcela });
    if (!c) throw naoEncontrado('Parcela não encontrada');
    if (c.status === 'PAGA') throw conflito('Esta parcela já foi recebida');
    if (c.status === 'CANCELADA') throw conflito('Esta parcela foi cancelada');

    const saldo = saldoParcela(c);
    const valor = dados.valor ?? saldo;
    if (valor > saldo) throw invalido(`O valor passa do que falta nesta parcela (${brl(saldo)})`);

    const valorPago = somar(num(c.valorPago), valor);
    const quitou = valorPago >= num(c.valor);
    await tx.contaReceber.update({
      where: { id },
      data: { valorPago, status: quitou ? 'PAGA' : 'PENDENTE', pagoEm: quitou ? new Date() : null },
    });

    const origem = c.os ? `OS #${c.os.numero}` : (c.descricao ?? 'Fiado');
    await lancar(tx, {
      tipo: 'ENTRADA',
      origem: 'OS',
      descricao: `Parcela ${c.parcela}/${c.totalParcelas}${quitou ? '' : ' (parcial)'} — ${origem} — ${c.cliente.nome}`,
      valor,
      formaPagamento: dados.formaPagamento,
      categoria: 'Contas a Receber',
      osId: c.osId,
      contaReceberId: c.id,
      usuarioId: ator.id,
    });

    if (quitou && c.osId) await atualizarQuitacaoDaOS(tx, c.osId);
  });

  const atualizada = await prisma.contaReceber.findUniqueOrThrow({ where: { id }, include: incluirParcela });
  return paraParcela(atualizada);
}

/**
 * Fiado lançado à mão — para passar o caderno de fiado para o sistema na
 * implantação (ou uma dívida que não veio de OS).
 */
export async function lancarFiado(dados: z.output<typeof lancarFiadoSchema>) {
  const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { ativo: true } });
  if (!cliente || !cliente.ativo) throw invalido('Cliente não encontrado');

  const valores = await prisma.$transaction((tx) =>
    gerarParcelas(tx, {
      clienteId: dados.clienteId,
      descricao: dados.descricao,
      total: dados.valor,
      parcelas: dados.parcelas,
      primeiroVencimento: dados.primeiroVencimento,
    }),
  );
  return { parcelas: valores.length, total: dados.valor };
}

/**
 * Cancela o que falta de uma parcela (perdão de dívida, calote assumido).
 * O que já foi pago continua registrado; só o saldo deixa de ser cobrado.
 */
export async function cancelar(id: string): Promise<ParcelaDTO> {
  await prisma.$transaction(async (tx) => {
    const c = await tx.contaReceber.findUnique({ where: { id } });
    if (!c) throw naoEncontrado('Parcela não encontrada');
    if (c.status !== 'PENDENTE') throw conflito('Só parcela pendente pode ser cancelada');
    await tx.contaReceber.update({ where: { id }, data: { status: 'CANCELADA' } });
    if (c.osId) await atualizarQuitacaoDaOS(tx, c.osId);
  });
  const atualizada = await prisma.contaReceber.findUniqueOrThrow({ where: { id }, include: incluirParcela });
  return paraParcela(atualizada);
}
