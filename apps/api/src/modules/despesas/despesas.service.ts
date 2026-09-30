import type { Despesa, Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { DespesaDTO, ListaDespesasDTO, UsuarioSessao } from '@hermes/shared';
import type { criarDespesaSchema, despesaSchema, listarDespesasQuery, pagarDespesaSchema } from '@hermes/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { conflito, naoEncontrado } from '../../lib/errors.js';
import { falhaDeVersao, naVersao, proximaVersao } from '../../lib/versao.js';
import { num, somar } from '../../lib/dinheiro.js';
import { adicionarMeses, dataLocal, hojeISO, inicioDoDia, intervalo, isoOuNull } from '../../lib/datas.js';
import { pagina, paginar } from '../../lib/paginacao.js';
import { lancar } from '../../dominio/caixa.js';

// RN-12: despesa paga vira saída no livro-caixa. Despesa paga não se altera
// nem se apaga — já está no caixa; mexer nela deixaria o caixa inconsistente.

const incluirRel = { fornecedor: { select: { id: true, nome: true } } } satisfies Prisma.DespesaInclude;
type DespesaCompleta = Prisma.DespesaGetPayload<{ include: typeof incluirRel }>;

function paraDTO(d: DespesaCompleta, hoje = inicioDoDia()): DespesaDTO {
  return {
    id: d.id,
    versao: d.versao,
    data: d.data.toISOString(),
    categoria: d.categoria,
    descricao: d.descricao,
    valor: num(d.valor),
    recorrente: d.recorrente,
    pago: d.pago,
    pagoEm: isoOuNull(d.pagoEm),
    formaPagamento: d.formaPagamento,
    vencida: !d.pago && d.data < hoje,
    fornecedor: d.fornecedor,
  };
}

/** Data de uma despesa: "hoje" vira agora; outra data, meio-dia dela. */
const dataDaDespesa = (d?: string | null) => (d && d !== hojeISO() ? dataLocal(d) : new Date());

function saidaNoCaixa(tx: Prisma.TransactionClient, d: Despesa, usuarioId: string, data?: Date) {
  return lancar(tx, {
    tipo: 'SAIDA',
    origem: 'DESPESA',
    descricao: d.descricao,
    valor: num(d.valor),
    categoria: d.categoria,
    formaPagamento: d.formaPagamento,
    despesaId: d.id,
    usuarioId,
    data,
  });
}

export async function listar(q: z.output<typeof listarDespesasQuery>): Promise<ListaDespesasDTO> {
  const periodo = intervalo(q.de, q.ate);
  const hoje = inicioDoDia();
  const where: Prisma.DespesaWhereInput = {
    ...(periodo ? { data: periodo } : {}),
    ...(q.categoria ? { categoria: { contains: q.categoria, mode: 'insensitive' } } : {}),
    ...(q.busca ? { descricao: { contains: q.busca, mode: 'insensitive' } } : {}),
    ...(q.situacao === 'PAGA' ? { pago: true } : {}),
    ...(q.situacao === 'PENDENTE' ? { pago: false } : {}),
    ...(q.situacao === 'VENCIDA' ? { pago: false, data: { lt: hoje } } : {}),
  };

  const [itens, total, soma] = await Promise.all([
    prisma.despesa.findMany({ where, orderBy: { data: 'desc' }, include: incluirRel, ...paginar(q) }),
    prisma.despesa.count({ where }),
    prisma.despesa.groupBy({ by: ['pago'], where, _sum: { valor: true } }),
  ]);
  const pago = num(soma.find((s) => s.pago)?._sum.valor);
  const aPagar = num(soma.find((s) => !s.pago)?._sum.valor);

  return {
    ...pagina(
      itens.map((d) => paraDTO(d, hoje)),
      total,
      q,
    ),
    totais: { total: somar(pago, aPagar), pago, aPagar },
  };
}

/** Categorias já usadas — a tela sugere enquanto a pessoa digita. */
export async function categorias(): Promise<string[]> {
  const linhas = await prisma.despesa.findMany({ distinct: ['categoria'], select: { categoria: true }, orderBy: { categoria: 'asc' } });
  return linhas.map((l) => l.categoria);
}

export async function buscar(id: string) {
  const d = await prisma.despesa.findUnique({ where: { id }, include: incluirRel });
  if (!d) throw naoEncontrado('Despesa não encontrada');
  return paraDTO(d);
}

export async function criar(dados: z.output<typeof criarDespesaSchema>, ator: UsuarioSessao) {
  const id = await prisma.$transaction(async (tx) => {
    const d = await tx.despesa.create({
      data: {
        categoria: dados.categoria,
        descricao: dados.descricao,
        valor: dados.valor,
        data: dataDaDespesa(dados.data),
        fornecedorId: dados.fornecedorId ?? null,
        recorrente: dados.recorrente,
        pago: dados.pago,
        pagoEm: dados.pago ? new Date() : null,
        formaPagamento: dados.pago ? (dados.formaPagamento ?? 'A_VISTA') : null,
      },
    });
    if (d.pago) await saidaNoCaixa(tx, d, ator.id); // já nasceu paga → sai do caixa
    return d.id;
  });
  return buscar(id);
}

export async function pagar(id: string, dados: z.output<typeof pagarDespesaSchema>, ator: UsuarioSessao) {
  await prisma.$transaction(async (tx) => {
    // Trava contra clique duplo: só paga quem ainda está pendente.
    const pagoEm = dataDaDespesa(dados.data);
    const { count } = await tx.despesa.updateMany({
      where: { id, pago: false },
      data: { pago: true, pagoEm, formaPagamento: dados.formaPagamento },
    });
    if (count === 0) {
      const existe = await tx.despesa.count({ where: { id } });
      throw existe ? conflito('Esta despesa já está paga') : naoEncontrado('Despesa não encontrada');
    }
    const d = await tx.despesa.findUniqueOrThrow({ where: { id } });
    await saidaNoCaixa(tx, d, ator.id, pagoEm);
  });
  return buscar(id);
}

async function naoPaga(id: string) {
  const d = await prisma.despesa.findUnique({ where: { id } });
  if (!d) throw naoEncontrado('Despesa não encontrada');
  if (d.pago) throw conflito('Despesa paga não pode ser alterada nem excluída (já entrou no caixa)');
  return d;
}

export async function atualizar(id: string, dados: z.output<typeof despesaSchema>) {
  await naoPaga(id);
  const r = await prisma.despesa.updateMany({
    where: { id, ...naVersao(dados.versao) },
    data: {
      categoria: dados.categoria,
      descricao: dados.descricao,
      valor: dados.valor,
      data: dataDaDespesa(dados.data),
      fornecedorId: dados.fornecedorId ?? null,
      recorrente: dados.recorrente,
      ...proximaVersao,
    },
  });
  if (r.count === 0) await falhaDeVersao('despesas', id, true, 'Despesa não encontrada');
  return buscar(id);
}

export async function excluir(id: string) {
  await naoPaga(id);
  await prisma.despesa.delete({ where: { id } });
}

/** Conta fixa (aluguel, energia): lança a do mês seguinte, com o mesmo valor, a pagar. */
export async function repetirNoProximoMes(id: string) {
  const d = await prisma.despesa.findUnique({ where: { id } });
  if (!d) throw naoEncontrado('Despesa não encontrada');
  const nova = await prisma.despesa.create({
    data: {
      categoria: d.categoria,
      descricao: d.descricao,
      valor: d.valor,
      data: adicionarMeses(d.data, 1),
      fornecedorId: d.fornecedorId,
      recorrente: d.recorrente,
    },
  });
  return buscar(nova.id);
}
