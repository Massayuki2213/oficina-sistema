import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { Pagina, UsuarioSessao, VendaDTO, VendaResumoDTO } from '@hermes/shared';
import type { listarVendasQuery, vendaSchema } from '@hermes/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { COD, conflito, invalido, naoEncontrado } from '../../lib/errors.js';
import { num } from '../../lib/dinheiro.js';
import { intervalo, isoOuNull } from '../../lib/datas.js';
import { pagina, paginar } from '../../lib/paginacao.js';
import { fecharTotal, precificar } from '../../dominio/precificacao.js';
import { darSaida, devolver, verificarFaltas } from '../../dominio/estoque.js';
import { lancar } from '../../dominio/caixa.js';
import { paraItemPeca } from '../ordens/ordens.mapper.js';

// ============================================================
// Venda de balcão — a peça sai sem OS (o cliente leva e instala,
// ou é produto: óleo, aditivo, palheta). Baixa o estoque e entra
// no caixa na hora. Cancelar devolve a peça e estorna o dinheiro.
// ============================================================

const incluirResumo = {
  cliente: { select: { id: true, nome: true } },
  _count: { select: { itens: true } },
} satisfies Prisma.VendaInclude;

const incluirCompleto = {
  ...incluirResumo,
  usuario: { select: { nome: true } },
  itens: {
    include: { peca: { select: { nome: true, unidade: true, precoVenda: true, estoqueAtual: true } } },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.VendaInclude;

type VendaResumo = Prisma.VendaGetPayload<{ include: typeof incluirResumo }>;
type VendaCompleta = Prisma.VendaGetPayload<{ include: typeof incluirCompleto }>;

function paraResumo(v: VendaResumo): VendaResumoDTO {
  return {
    id: v.id,
    numero: v.numero,
    data: v.data.toISOString(),
    cliente: v.cliente,
    total: num(v.total),
    formaPagamento: v.formaPagamento,
    qtdItens: v._count.itens,
    cancelada: !!v.canceladaEm,
  };
}

function paraDTO(v: VendaCompleta): VendaDTO {
  return {
    ...paraResumo(v),
    subtotal: num(v.subtotal),
    desconto: num(v.desconto),
    observacoes: v.observacoes,
    usuario: v.usuario?.nome ?? null,
    canceladaEm: isoOuNull(v.canceladaEm),
    motivoCancelamento: v.motivoCancelamento,
    itens: v.itens.map(paraItemPeca),
  };
}

export async function listar(q: z.output<typeof listarVendasQuery>): Promise<Pagina<VendaResumoDTO>> {
  const periodo = intervalo(q.de, q.ate);
  const where: Prisma.VendaWhereInput = {
    ...(periodo ? { data: periodo } : {}),
    ...(q.busca
      ? {
          OR: [
            { cliente: { nome: { contains: q.busca, mode: 'insensitive' } } },
            { itens: { some: { peca: { nome: { contains: q.busca, mode: 'insensitive' } } } } },
            ...(/^\d{1,7}$/.test(q.busca) ? [{ numero: Number(q.busca) }] : []),
          ],
        }
      : {}),
  };
  const [itens, total] = await prisma.$transaction([
    prisma.venda.findMany({ where, orderBy: { data: 'desc' }, include: incluirResumo, ...paginar(q) }),
    prisma.venda.count({ where }),
  ]);
  return pagina(itens.map(paraResumo), total, q);
}

export async function buscar(id: string): Promise<VendaDTO> {
  const v = await prisma.venda.findUnique({ where: { id }, include: incluirCompleto });
  if (!v) throw naoEncontrado('Venda não encontrada');
  return paraDTO(v);
}

export async function criar(dados: z.output<typeof vendaSchema>, ator: UsuarioSessao): Promise<VendaDTO> {
  if (dados.clienteId) {
    const c = await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { ativo: true } });
    if (!c || !c.ativo) throw invalido('Cliente informado não existe');
  }

  const precos = await precificar(prisma, { servicos: [], pecas: dados.itens }, ator);
  const totais = await fecharTotal(precos, dados.desconto, ator, dados.senhaDono);

  // No balcão a peça está na mão: se o sistema diz que não há, a contagem está
  // errada — confirma e segue (o saldo negativo aparece para ajustar depois).
  const faltas = await verificarFaltas(prisma, precos.pecas);
  if (faltas.length > 0 && !dados.confirmarSemEstoque) {
    throw conflito(
      `O estoque do sistema não tem: ${faltas.map((f) => f.nome).join(', ')}. Confirme se a peça está mesmo na mão.`,
      COD.ESTOQUE_INSUFICIENTE,
      faltas,
    );
  }

  const id = await prisma.$transaction(async (tx) => {
    const venda = await tx.venda.create({
      data: {
        clienteId: dados.clienteId ?? null,
        usuarioId: ator.id,
        ...totais,
        formaPagamento: dados.formaPagamento,
        observacoes: dados.observacoes ?? null,
      },
    });
    for (const p of precos.pecas) {
      const { custo } = await darSaida(tx, p.pecaId, p.quantidade, {
        motivo: `Venda de balcão #${venda.numero}`,
        vendaId: venda.id,
        usuarioId: ator.id,
      });
      await tx.vendaItem.create({
        data: { vendaId: venda.id, pecaId: p.pecaId, quantidade: p.quantidade, precoUnit: p.precoUnit, custoUnit: custo },
      });
    }
    if (totais.total > 0) {
      await lancar(tx, {
        tipo: 'ENTRADA',
        origem: 'VENDA_BALCAO',
        descricao: `Venda de balcão #${venda.numero}`,
        valor: totais.total,
        formaPagamento: dados.formaPagamento,
        categoria: 'Venda de balcão',
        vendaId: venda.id,
        usuarioId: ator.id,
      });
    }
    return venda.id;
  });
  return buscar(id);
}

/** Cancela a venda: a peça volta ao estoque e o dinheiro sai como estorno. */
export async function cancelar(id: string, motivo: string, ator: UsuarioSessao): Promise<VendaDTO> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM vendas WHERE id = ${id} FOR UPDATE`;
    const v = await tx.venda.findUnique({ where: { id }, include: { itens: true } });
    if (!v) throw naoEncontrado('Venda não encontrada');
    if (v.canceladaEm) throw conflito('Esta venda já foi cancelada');

    for (const item of v.itens) {
      await devolver(tx, item.pecaId, num(item.quantidade), {
        motivo: `Cancelamento da venda #${v.numero}`,
        vendaId: id,
        usuarioId: ator.id,
      });
    }
    if (num(v.total) > 0) {
      await lancar(tx, {
        tipo: 'SAIDA',
        origem: 'ESTORNO',
        descricao: `Estorno — venda de balcão #${v.numero}: ${motivo}`,
        valor: num(v.total),
        formaPagamento: v.formaPagamento,
        categoria: 'Estorno',
        vendaId: id,
        usuarioId: ator.id,
      });
    }
    await tx.venda.update({ where: { id }, data: { canceladaEm: new Date(), motivoCancelamento: motivo } });
  });
  return buscar(id);
}
