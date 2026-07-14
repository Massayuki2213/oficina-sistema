import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { AppError } from '../../lib/errors.js';
import { aplicarEntradaEstoque } from '../pecas/pecas.service.js';
import type { CreateCompraInput } from './compras.schema.js';

const num = (v: unknown) => Number(v);
const round = (n: number) => Math.round(n * 100) / 100;

const invalidarEstoque = () => redis.del('pecas:list'); // a compra deu entrada no estoque

function toDTO(c: any) {
  return {
    ...c,
    valorTotal: num(c.valorTotal),
    itens: c.itens?.map((i: any) => ({
      ...i,
      custoUnit: num(i.custoUnit),
      subtotal: round(num(i.custoUnit) * i.quantidade),
      peca: i.peca ? { ...i.peca, precoCusto: num(i.peca.precoCusto), precoVenda: num(i.peca.precoVenda) } : undefined,
    })),
  };
}

const fullInclude = {
  fornecedor: { select: { id: true, nome: true } },
  itens: { include: { peca: { select: { id: true, nome: true, precoCusto: true, precoVenda: true, unidade: true } } } },
} as const;

// Uma compra paga vira saída no livro-caixa (mesmo padrão da despesa paga, RN-12).
function lancarSaidaNoCaixa(tx: Prisma.TransactionClient, descricao: string, valor: Prisma.Decimal | number, usuarioId?: string) {
  return tx.lancamentoCaixa.create({
    data: { tipo: 'SAIDA', origem: 'DESPESA', descricao, valor, categoria: 'Compra de peças', usuarioId },
  });
}

export async function listCompras(filtros: { de?: string; ate?: string; fornecedorId?: string; status?: 'PENDENTE' | 'PAGA' }) {
  const gte = filtros.de ? new Date(filtros.de + 'T00:00:00') : undefined;
  const lte = filtros.ate ? new Date(filtros.ate + 'T23:59:59.999') : undefined;

  const compras = await prisma.compra.findMany({
    where: {
      ...(gte || lte ? { data: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } } : {}),
      ...(filtros.fornecedorId ? { fornecedorId: filtros.fornecedorId } : {}),
      ...(filtros.status ? { status: filtros.status } : {}),
    },
    orderBy: { data: 'desc' },
    include: { fornecedor: { select: { id: true, nome: true } }, _count: { select: { itens: true } } },
  });

  const total = compras.reduce((s, c) => s + num(c.valorTotal), 0);
  const aPagar = compras.filter((c) => c.status === 'PENDENTE').reduce((s, c) => s + num(c.valorTotal), 0);
  return {
    compras: compras.map((c) => ({ ...c, valorTotal: num(c.valorTotal) })),
    totais: { total: round(total), aPagar: round(aPagar), pago: round(total - aPagar) },
  };
}

export async function getCompra(id: string) {
  const compra = await prisma.compra.findUnique({ where: { id }, include: fullInclude });
  return compra ? toDTO(compra) : null;
}

export async function createCompra(input: CreateCompraInput, usuarioId?: string) {
  const fornecedor = await prisma.fornecedor.findUnique({ where: { id: input.fornecedorId } });
  if (!fornecedor) throw new AppError(400, 'Distribuidor não encontrado');

  const valorTotal = round(input.itens.reduce((s, i) => s + i.custoUnit * i.quantidade, 0));
  const data = input.data ? new Date(input.data + 'T12:00:00') : undefined;

  const compra = await prisma.$transaction(async (tx) => {
    const criada = await tx.compra.create({
      data: {
        fornecedorId: input.fornecedorId,
        numeroNota: input.numeroNota ?? null,
        observacoes: input.observacoes ?? null,
        valorTotal,
        status: input.pago ? 'PAGA' : 'PENDENTE',
        pagoEm: input.pago ? new Date() : null,
        ...(data ? { data } : {}),
      },
    });

    for (const item of input.itens) {
      // Peça nova nasce com o custo desta compra; a entrada de estoque logo
      // abaixo recalcula a média (aqui ela ainda tem estoque 0).
      let pecaId = item.pecaId;
      if (!pecaId && item.pecaNova) {
        const nova = await tx.peca.create({
          data: {
            nome: item.pecaNova.nome,
            precoCusto: item.custoUnit,
            precoVenda: item.pecaNova.precoVenda,
            fornecedorId: input.fornecedorId,
          },
        });
        pecaId = nova.id;
      }
      if (!pecaId) throw new AppError(400, 'Item de compra sem peça');

      await aplicarEntradaEstoque(tx, pecaId, item.quantidade, item.custoUnit, `Compra #${criada.numero} — ${fornecedor.nome}`);
      await tx.compraItem.create({
        data: { compraId: criada.id, pecaId, quantidade: item.quantidade, custoUnit: item.custoUnit },
      });
    }

    // À vista: já sai do caixa. A prazo: fica como conta a pagar até o acerto.
    if (input.pago) {
      await lancarSaidaNoCaixa(tx, `Compra #${criada.numero} — ${fornecedor.nome}`, valorTotal, usuarioId);
    }
    return criada;
  });

  await invalidarEstoque();
  return getCompra(compra.id);
}

/** Resumo "quanto devo a cada distribuidor" (compras PENDENTE agrupadas). */
export async function contasAPagar() {
  const pendentes = await prisma.compra.findMany({
    where: { status: 'PENDENTE' },
    include: { fornecedor: { select: { id: true, nome: true, telefone: true } } },
    orderBy: { data: 'asc' },
  });

  const map = new Map<string, any>();
  for (const c of pendentes) {
    const cur = map.get(c.fornecedorId) ?? {
      fornecedor: c.fornecedor,
      totalDevido: 0,
      compras: 0,
      compraMaisAntiga: c.data,
    };
    cur.totalDevido += num(c.valorTotal);
    cur.compras += 1;
    if (c.data < cur.compraMaisAntiga) cur.compraMaisAntiga = c.data;
    map.set(c.fornecedorId, cur);
  }

  const fornecedores = [...map.values()]
    .map((f) => ({ ...f, totalDevido: round(f.totalDevido) }))
    .sort((a, b) => b.totalDevido - a.totalDevido);

  return { totalAPagar: round(fornecedores.reduce((s, f) => s + f.totalDevido, 0)), fornecedores };
}

/** Paga uma compra a prazo: quita e lança a saída no caixa. */
export async function pagarCompra(id: string, usuarioId?: string) {
  const compra = await prisma.compra.findUnique({ where: { id }, include: { fornecedor: { select: { nome: true } } } });
  if (!compra) throw new AppError(404, 'Compra não encontrada');
  if (compra.status === 'PAGA') throw new AppError(409, 'Esta compra já foi paga');

  await prisma.$transaction(async (tx) => {
    await tx.compra.update({ where: { id }, data: { status: 'PAGA', pagoEm: new Date() } });
    await lancarSaidaNoCaixa(tx, `Compra #${compra.numero} — ${compra.fornecedor.nome}`, compra.valorTotal, usuarioId);
  });

  return getCompra(id);
}

/** Acerto do mês: quita todas as compras pendentes de um distribuidor de uma vez. */
export async function quitarFornecedor(fornecedorId: string, usuarioId?: string) {
  const fornecedor = await prisma.fornecedor.findUnique({ where: { id: fornecedorId } });
  if (!fornecedor) throw new AppError(404, 'Distribuidor não encontrado');

  const pendentes = await prisma.compra.findMany({ where: { fornecedorId, status: 'PENDENTE' } });
  if (pendentes.length === 0) throw new AppError(409, 'Este distribuidor não tem compras em aberto');

  const total = round(pendentes.reduce((s, c) => s + num(c.valorTotal), 0));

  await prisma.$transaction(async (tx) => {
    await tx.compra.updateMany({ where: { fornecedorId, status: 'PENDENTE' }, data: { status: 'PAGA', pagoEm: new Date() } });
    // Um único lançamento agregado, para o caixa não encher de linhas no acerto.
    await lancarSaidaNoCaixa(tx, `Acerto — ${fornecedor.nome} (${pendentes.length} compra(s))`, total, usuarioId);
  });

  return { quitadas: pendentes.length, total };
}

/** Exclui uma compra a prazo, estornando o estoque. Compra paga não se apaga. */
export async function deleteCompra(id: string) {
  const compra = await prisma.compra.findUnique({ where: { id }, include: { itens: true } });
  if (!compra) throw new AppError(404, 'Compra não encontrada');
  if (compra.status === 'PAGA') throw new AppError(400, 'Compra paga não pode ser apagada (já saiu no caixa)');

  await prisma.$transaction(async (tx) => {
    // Estorna o estoque que a compra havia dado entrada.
    for (const item of compra.itens) {
      await tx.peca.update({ where: { id: item.pecaId }, data: { estoqueAtual: { decrement: item.quantidade } } });
      await tx.movimentoEstoque.create({
        data: { pecaId: item.pecaId, tipo: 'SAIDA', quantidade: item.quantidade, motivo: `Estorno da compra #${compra.numero}` },
      });
    }
    await tx.compra.delete({ where: { id } }); // itens saem por cascade
  });

  await invalidarEstoque();
}
