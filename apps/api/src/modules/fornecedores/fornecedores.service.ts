import type { z } from 'zod';
import type { FornecedorDTO } from '@hermes/shared';
import type { fornecedorSchema } from '@hermes/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { conflito, naoEncontrado } from '../../lib/errors.js';
import { falhaDeVersao, naVersao, proximaVersao } from '../../lib/versao.js';
import { num, somar } from '../../lib/dinheiro.js';

type DadosFornecedor = z.output<typeof fornecedorSchema>;

/**
 * Distribuidores com quanto se deve para cada um (soma das compras a prazo
 * ainda PENDENTE). É o "de olho na conta a pagar" direto no cadastro.
 */
export async function listar(): Promise<FornecedorDTO[]> {
  const fornecedores = await prisma.fornecedor.findMany({
    orderBy: { nome: 'asc' },
    include: {
      compras: { where: { status: 'PENDENTE' }, select: { valorTotal: true } },
      _count: { select: { pecas: true } },
    },
  });
  return fornecedores.map(({ compras, _count, ...f }) => ({
    id: f.id,
    versao: f.versao,
    nome: f.nome,
    cnpj: f.cnpj,
    contato: f.contato,
    telefone: f.telefone,
    email: f.email,
    prazoEntrega: f.prazoEntrega,
    observacoes: f.observacoes,
    deve: somar(...compras.map((c) => num(c.valorTotal))),
    comprasAbertas: compras.length,
    qtdPecas: _count.pecas,
  }));
}

export async function buscar(id: string) {
  const lista = await listar();
  const f = lista.find((x) => x.id === id);
  if (!f) throw naoEncontrado('Distribuidor não encontrado');
  return f;
}

export async function criar(dados: DadosFornecedor) {
  const f = await prisma.fornecedor.create({ data: dados });
  return buscar(f.id);
}

export async function atualizar(id: string, { versao, ...dados }: DadosFornecedor) {
  const r = await prisma.fornecedor.updateMany({ where: { id, ...naVersao(versao) }, data: { ...dados, ...proximaVersao } });
  if (r.count === 0) {
    await falhaDeVersao('fornecedores', id, (await prisma.fornecedor.count({ where: { id } })) > 0, 'Distribuidor não encontrado');
  }
  return buscar(id);
}

/**
 * Distribuidor não tem "inativo": a exclusão é definitiva, então é bloqueada
 * se houver compras ou peças ligadas — apagar arrastaria histórico.
 */
export async function excluir(id: string) {
  const f = await prisma.fornecedor.findUnique({
    where: { id },
    include: { _count: { select: { compras: true, pecas: true, despesas: true } } },
  });
  if (!f) throw naoEncontrado('Distribuidor não encontrado');
  if (f._count.compras > 0) throw conflito('Este distribuidor tem compras registradas e não pode ser excluído');
  if (f._count.pecas > 0) {
    throw conflito('Há peças ligadas a este distribuidor; troque o fornecedor delas antes de excluir');
  }
  if (f._count.despesas > 0) throw conflito('Há despesas ligadas a este distribuidor');
  await prisma.fornecedor.delete({ where: { id } });
}
