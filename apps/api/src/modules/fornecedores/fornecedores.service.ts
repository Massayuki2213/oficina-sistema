import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import type { CreateFornecedorInput, UpdateFornecedorInput } from './fornecedores.schema.js';

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Lista os distribuidores com quanto se deve para cada um (soma das compras
 * ainda PENDENTE). É o "de olho na conta a pagar" direto no cadastro.
 */
export async function listFornecedores() {
  const fornecedores = await prisma.fornecedor.findMany({
    orderBy: { nome: 'asc' },
    include: {
      compras: { where: { status: 'PENDENTE' }, select: { valorTotal: true } },
      _count: { select: { pecas: true, compras: true } },
    },
  });

  return fornecedores.map(({ compras, ...f }) => ({
    ...f,
    deve: round(compras.reduce((s, c) => s + Number(c.valorTotal), 0)),
    comprasAbertas: compras.length,
  }));
}

export async function getFornecedor(id: string) {
  return prisma.fornecedor.findUnique({ where: { id } });
}

export async function createFornecedor(data: CreateFornecedorInput) {
  return prisma.fornecedor.create({ data });
}

export async function updateFornecedor(id: string, data: UpdateFornecedorInput) {
  return prisma.fornecedor.update({ where: { id }, data });
}

/**
 * Fornecedores não têm "ativo" no schema, então a exclusão é definitiva.
 * Bloqueia se houver compras ou peças ligadas — apagar arrastaria histórico.
 */
export async function deleteFornecedor(id: string) {
  const forn = await prisma.fornecedor.findUnique({
    where: { id },
    include: { _count: { select: { compras: true, pecas: true } } },
  });
  if (!forn) throw new AppError(404, 'Distribuidor não encontrado');
  if (forn._count.compras > 0) {
    throw new AppError(409, 'Este distribuidor tem compras registradas e não pode ser excluído');
  }
  if (forn._count.pecas > 0) {
    throw new AppError(409, 'Há peças ligadas a este distribuidor; troque o fornecedor delas antes de excluir');
  }
  await prisma.fornecedor.delete({ where: { id } });
}
