import type { Prisma } from '@prisma/client';
import type { ItemPecaDTO, ItemPecaOSDTO, ItemServicoDTO, OSResumoDTO, StatusOS } from '@hermes/shared';
import { STATUS_OS_ABERTOS } from '@hermes/shared';
import { multiplicar, num } from '../../lib/dinheiro.js';
import { isoOuNull } from '../../lib/datas.js';

// Formato da OS nas respostas. Fica num arquivo próprio porque outras
// telas mostram OS (ficha do cliente, painel, alertas) e precisam do
// mesmo resumo — um formato só, montado num lugar só.

export const incluirOSResumo = {
  cliente: { select: { id: true, nome: true } },
  carro: { select: { id: true, placa: true, modelo: true } },
  mecanico: { select: { id: true, nome: true } },
} satisfies Prisma.OrdemServicoInclude;

type OSComResumo = Prisma.OrdemServicoGetPayload<{ include: typeof incluirOSResumo }>;

const aindaNaOficina = (status: StatusOS) => STATUS_OS_ABERTOS.includes(status) && status !== 'CONCLUIDA';

export function paraOSResumo(o: OSComResumo): OSResumoDTO {
  return {
    id: o.id,
    numero: o.numero,
    status: o.status,
    dataAbertura: o.dataAbertura.toISOString(),
    dataPrevista: isoOuNull(o.dataPrevista),
    dataConclusao: isoOuNull(o.dataConclusao),
    total: num(o.total),
    pago: o.pago,
    formaPagamento: o.formaPagamento,
    garantia: o.garantia,
    cliente: o.cliente,
    carro: o.carro,
    mecanico: o.mecanico,
    atrasada: !!o.dataPrevista && o.dataPrevista < new Date() && aindaNaOficina(o.status),
  };
}

// ---- Itens (orçamento e OS têm o mesmo formato de linha) -------------------

type LinhaServico = {
  id: string;
  servicoId: string;
  quantidade: number;
  precoUnit: Prisma.Decimal;
  concluido?: boolean;
  servico: { nome: string; precoMaoDeObra: Prisma.Decimal };
};

/** O que toda linha de peça (orçamento, OS, venda) precisa saber da peça. */
export const selecaoPecaDoItem = {
  select: { nome: true, unidade: true, sku: true, precoVenda: true, precoADefinir: true, estoqueAtual: true },
} as const;

type LinhaPeca = {
  id: string;
  pecaId: string;
  quantidade: Prisma.Decimal;
  precoUnit: Prisma.Decimal;
  peca: Prisma.PecaGetPayload<typeof selecaoPecaDoItem>;
};

export const incluirItens = {
  servicos: { include: { servico: { select: { nome: true, precoMaoDeObra: true } } }, orderBy: { id: 'asc' } },
  pecas: { include: { peca: selecaoPecaDoItem }, orderBy: { id: 'asc' } },
} as const;

/** Na OS, a linha de peça traz também a encomenda: para quem foi pedida e que compra trouxe. */
export const incluirPecasDaOS = {
  pecas: {
    include: {
      peca: selecaoPecaDoItem,
      pedidoFornecedor: { select: { id: true, nome: true } },
      compraItem: {
        select: { compra: { select: { id: true, numero: true, numeroNota: true, data: true, fornecedor: { select: { nome: true } } } } },
      },
    },
    orderBy: { id: 'asc' },
  },
} as const;

type LinhaPecaOS = Prisma.OSPecaGetPayload<(typeof incluirPecasDaOS)['pecas']>;

export function paraItemServico(s: LinhaServico): ItemServicoDTO {
  const precoUnit = num(s.precoUnit);
  return {
    id: s.id,
    servicoId: s.servicoId,
    nome: s.servico.nome,
    quantidade: s.quantidade,
    precoUnit,
    precoCatalogo: num(s.servico.precoMaoDeObra),
    subtotal: multiplicar(precoUnit, s.quantidade),
    concluido: s.concluido ?? false,
  };
}

export function paraItemPeca(p: LinhaPeca): ItemPecaDTO {
  const precoUnit = num(p.precoUnit);
  const quantidade = num(p.quantidade);
  return {
    id: p.id,
    pecaId: p.pecaId,
    nome: p.peca.nome,
    unidade: p.peca.unidade,
    quantidade,
    precoUnit,
    precoCatalogo: num(p.peca.precoVenda),
    subtotal: multiplicar(precoUnit, quantidade),
    estoqueAtual: num(p.peca.estoqueAtual),
    codigo: p.peca.sku,
    precoADefinir: p.peca.precoADefinir,
  };
}

/** `osCancelada`: a OS devolveu as peças ao estoque — nada mais a pedir. */
export function paraItemPecaOS(p: LinhaPecaOS, osCancelada = false): ItemPecaOSDTO {
  const compra = p.compraItem?.compra;
  return {
    ...paraItemPeca(p),
    encomenda: num(p.encomenda),
    aPedir: !osCancelada && num(p.encomenda) > 0 && !p.compraItemId,
    pedido: p.pedidoFornecedor && p.pedidoEm ? { fornecedor: p.pedidoFornecedor, em: p.pedidoEm.toISOString() } : null,
    chegou: compra
      ? {
          compra: { id: compra.id, numero: compra.numero },
          fornecedor: compra.fornecedor.nome,
          numeroNota: compra.numeroNota,
          data: compra.data.toISOString(),
        }
      : null,
    precoConferido: p.precoConferido,
  };
}
