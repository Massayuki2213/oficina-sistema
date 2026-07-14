import type { Peca as PrismaPeca, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import type { CreatePecaInput, UpdatePecaInput, EntradaEstoqueInput } from './pecas.schema.js';

const CACHE_KEY = 'pecas:list';
const CACHE_TTL = 60;
const invalidarCache = () => redis.del(CACHE_KEY);

// Margem sugerida (RN-05): (venda - custo) / custo.
function calcularMargem(custo: number, venda: number): number | null {
  if (!custo || custo <= 0) return null;
  return Number((((venda - custo) / custo) * 100).toFixed(2));
}

/**
 * Núcleo da entrada de estoque (RN-04), reutilizado pela entrada avulsa e pela
 * compra do distribuidor: registra o movimento, soma a quantidade e recalcula o
 * custo médio ponderado (quando um novo custo é informado). Roda dentro da
 * transação que o chamador passar — a compra baixa vários itens de uma vez.
 */
export async function aplicarEntradaEstoque(
  tx: Prisma.TransactionClient,
  pecaId: string,
  quantidade: number,
  custoUnit: number | null,
  motivo: string,
) {
  const peca = await tx.peca.findUnique({ where: { id: pecaId } });
  if (!peca) throw new Error(`Peça ${pecaId} não encontrada`);

  const custoAtual = Number(peca.precoCusto);
  let novoCusto = custoAtual;
  if (custoUnit != null) {
    const totalAtual = peca.estoqueAtual * custoAtual;
    const totalEntrada = quantidade * custoUnit;
    const novaQtd = peca.estoqueAtual + quantidade;
    novoCusto = novaQtd > 0 ? Number(((totalAtual + totalEntrada) / novaQtd).toFixed(2)) : custoUnit;
  }

  await tx.movimentoEstoque.create({
    data: { pecaId, tipo: 'ENTRADA', quantidade, custoUnit: custoUnit ?? null, motivo },
  });
  return tx.peca.update({
    where: { id: pecaId },
    data: {
      estoqueAtual: { increment: quantidade },
      precoCusto: novoCusto,
      margemPct: calcularMargem(novoCusto, Number(peca.precoVenda)),
    },
  });
}

// Converte os Decimals do Prisma para number e marca estoque baixo (RN-02),
// mantendo o contrato do @hermes/shared (dinheiro em number).
function toDTO(p: PrismaPeca) {
  return {
    ...p,
    precoCusto: Number(p.precoCusto),
    precoVenda: Number(p.precoVenda),
    margemPct: p.margemPct == null ? null : Number(p.margemPct),
    estoqueBaixo: p.estoqueAtual <= p.estoqueMinimo,
  };
}

export async function listPecas(busca?: string) {
  if (!busca) {
    const hit = await redis.get(CACHE_KEY);
    if (hit) return JSON.parse(hit);
  }

  const pecas = await prisma.peca.findMany({
    where: {
      ativo: true,
      ...(busca
        ? {
            OR: [
              { nome: { contains: busca, mode: 'insensitive' } },
              { sku: { contains: busca, mode: 'insensitive' } },
              { codigoBarras: { contains: busca } },
            ],
          }
        : {}),
    },
    orderBy: { nome: 'asc' },
  });

  const dto = pecas.map(toDTO);
  if (!busca) await redis.set(CACHE_KEY, JSON.stringify(dto), 'EX', CACHE_TTL);
  return dto;
}

// O "scan": procura a peça pelo código de barras lido.
export async function buscarPorCodigo(codigo: string) {
  const peca = await prisma.peca.findFirst({ where: { codigoBarras: codigo, ativo: true } });
  return peca ? toDTO(peca) : null;
}

export async function createPeca(data: CreatePecaInput) {
  const margemPct = calcularMargem(data.precoCusto, data.precoVenda);
  const peca = await prisma.peca.create({ data: { ...data, margemPct } });

  // Estoque inicial gera um movimento de entrada (rastreabilidade).
  if (data.estoqueAtual > 0) {
    await prisma.movimentoEstoque.create({
      data: {
        pecaId: peca.id,
        tipo: 'ENTRADA',
        quantidade: data.estoqueAtual,
        custoUnit: data.precoCusto,
        motivo: 'Cadastro inicial',
      },
    });
  }

  await invalidarCache();
  return toDTO(peca);
}

export async function updatePeca(id: string, data: UpdatePecaInput) {
  const atual = await prisma.peca.findUnique({ where: { id } });
  if (!atual) return null;

  const custo = data.precoCusto ?? Number(atual.precoCusto);
  const venda = data.precoVenda ?? Number(atual.precoVenda);

  const peca = await prisma.peca.update({
    where: { id },
    data: { ...data, margemPct: calcularMargem(custo, venda) },
  });

  await invalidarCache();
  return toDTO(peca);
}

// Soft delete: mantém o histórico (OS antigas, movimentos), só tira do catálogo/estoque.
export async function deactivatePeca(id: string) {
  const peca = await prisma.peca.update({ where: { id }, data: { ativo: false } });
  await invalidarCache();
  return toDTO(peca);
}

// Entrada de estoque avulsa (RN-04) — ex: reposição pelo leitor de código.
export async function entradaEstoque(id: string, input: EntradaEstoqueInput) {
  const existe = await prisma.peca.findUnique({ where: { id }, select: { id: true } });
  if (!existe) return null;

  const atualizada = await prisma.$transaction((tx) =>
    aplicarEntradaEstoque(tx, id, input.quantidade, input.custoUnit ?? null, input.motivo ?? 'Entrada via leitor'),
  );

  await invalidarCache();
  return toDTO(atualizada);
}
