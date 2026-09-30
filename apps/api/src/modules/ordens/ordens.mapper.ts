import type { Prisma } from '@prisma/client';
import type { ItemPecaDTO, ItemServicoDTO, OSResumoDTO, StatusOS } from '@hermes/shared';
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

type LinhaPeca = {
  id: string;
  pecaId: string;
  quantidade: Prisma.Decimal;
  precoUnit: Prisma.Decimal;
  peca: { nome: string; unidade: string; precoVenda: Prisma.Decimal; estoqueAtual: Prisma.Decimal };
};

export const incluirItens = {
  servicos: { include: { servico: { select: { nome: true, precoMaoDeObra: true } } }, orderBy: { id: 'asc' } },
  pecas: {
    include: { peca: { select: { nome: true, unidade: true, precoVenda: true, estoqueAtual: true } } },
    orderBy: { id: 'asc' },
  },
} as const;

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
  };
}
