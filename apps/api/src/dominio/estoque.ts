import type { Prisma, PrismaClient } from '@prisma/client';
import type { FaltaEstoqueDTO } from '@hermes/shared';
import { arredondar, num, somarQtd } from '../lib/dinheiro.js';
import { naoEncontrado } from '../lib/errors.js';

// ============================================================
// Estoque — TODA mudança de quantidade de peça passa por aqui.
//
// Cada função grava o movimento (kardex) com o saldo logo depois
// dele. Por isso o saldo da peça sempre fecha com o histórico, e dá
// para responder "para onde foi a peça?" olhando uma lista só.
//
// A linha da peça é travada (SELECT ... FOR UPDATE) durante a
// transação: duas OS baixando a mesma peça ao mesmo tempo não se
// atropelam no saldo nem no custo médio.
// ============================================================

type Tx = Prisma.TransactionClient;

/** Quem/o que originou o movimento — vira o "motivo" e os vínculos do kardex. */
export interface OrigemMovimento {
  motivo: string;
  usuarioId?: string | null;
  osId?: string | null;
  compraId?: string | null;
  vendaId?: string | null;
}

interface PecaTravada {
  id: string;
  nome: string;
  unidade: string;
  estoque: number;
  custo: number;
  venda: number;
}

async function travar(tx: Tx, pecaId: string): Promise<PecaTravada> {
  const [p] = await tx.$queryRaw<
    { id: string; nome: string; unidade: string; estoque_atual: unknown; preco_custo: unknown; preco_venda: unknown }[]
  >`SELECT id, nome, unidade, estoque_atual, preco_custo, preco_venda FROM pecas WHERE id = ${pecaId} FOR UPDATE`;
  if (!p) throw naoEncontrado('Peça não encontrada');
  return {
    id: p.id,
    nome: p.nome,
    unidade: p.unidade,
    estoque: num(p.estoque_atual as string),
    custo: num(p.preco_custo as string),
    venda: num(p.preco_venda as string),
  };
}

const vinculos = (o: OrigemMovimento) => ({
  motivo: o.motivo,
  usuarioId: o.usuarioId ?? null,
  osId: o.osId ?? null,
  compraId: o.compraId ?? null,
  vendaId: o.vendaId ?? null,
});

/** Margem sobre o custo (RN-05): (venda − custo) / custo, em %. */
export function calcularMargem(custo: number, venda: number): number | null {
  if (custo <= 0) return null;
  return Math.round(((venda - custo) / custo) * 10_000) / 100;
}

/**
 * Entrada (RN-04): soma a quantidade e, quando vem com custo, recalcula o
 * custo médio ponderado.
 *
 * Com o saldo zerado ou negativo (peça que já saiu antes de chegar, por
 * encomenda), não há estoque "velho" para ponderar: o custo passa a ser o
 * da própria entrada. Ponderar um saldo negativo daria um custo absurdo.
 */
export async function darEntrada(tx: Tx, pecaId: string, quantidade: number, custoUnit: number | null, origem: OrigemMovimento) {
  const p = await travar(tx, pecaId);

  let custo = p.custo;
  if (custoUnit != null) {
    custo = p.estoque <= 0 ? custoUnit : arredondar((p.estoque * p.custo + quantidade * custoUnit) / (p.estoque + quantidade));
  }
  const saldo = somarQtd(p.estoque, quantidade);

  await tx.peca.update({
    where: { id: pecaId },
    data: { estoqueAtual: saldo, precoCusto: custo, margemPct: calcularMargem(custo, p.venda) },
  });
  await tx.movimentoEstoque.create({
    data: { pecaId, tipo: 'ENTRADA', quantidade, saldoApos: saldo, custoUnit, ...vinculos(origem) },
  });
  return { saldo, custo };
}

/**
 * Saída (RN-01): baixa a quantidade. Pode deixar o saldo negativo — é a
 * peça encomendada (RN-03); quem chama decide se isso foi confirmado.
 * Devolve o custo médio do momento, que a OS/venda guarda como "custo da
 * peça vendida" (a margem do relatório não muda se a peça encarecer depois).
 */
export async function darSaida(tx: Tx, pecaId: string, quantidade: number, origem: OrigemMovimento) {
  const p = await travar(tx, pecaId);
  const saldo = somarQtd(p.estoque, -quantidade);

  await tx.peca.update({ where: { id: pecaId }, data: { estoqueAtual: saldo } });
  await tx.movimentoEstoque.create({
    data: { pecaId, tipo: 'SAIDA', quantidade, saldoApos: saldo, custoUnit: p.custo, ...vinculos(origem) },
  });
  return { saldo, custo: p.custo };
}

/** Devolve ao estoque o que tinha saído (OS cancelada, item removido, venda cancelada). Não mexe no custo. */
export function devolver(tx: Tx, pecaId: string, quantidade: number, origem: OrigemMovimento) {
  return darEntrada(tx, pecaId, quantidade, null, origem);
}

/**
 * Inventário: o saldo passa a ser o que foi CONTADO na prateleira, e a
 * diferença fica registrada (com sinal) como AJUSTE. Sem diferença, nada
 * é gravado — a contagem bateu.
 */
export async function ajustar(tx: Tx, pecaId: string, contado: number, origem: OrigemMovimento) {
  const p = await travar(tx, pecaId);
  const diferenca = somarQtd(contado, -p.estoque);
  if (diferenca === 0) return { diferenca, saldo: p.estoque };

  await tx.peca.update({ where: { id: pecaId }, data: { estoqueAtual: contado } });
  await tx.movimentoEstoque.create({
    data: { pecaId, tipo: 'AJUSTE', quantidade: diferenca, saldoApos: contado, ...vinculos(origem) },
  });
  return { diferenca, saldo: contado };
}

/**
 * RN-03 — o que faltaria no estoque para atender esta lista, sem mexer em nada.
 * Vazio = tem tudo. A tela usa o resultado para perguntar "encomendar?".
 */
export async function verificarFaltas(
  db: Tx | PrismaClient,
  itens: { pecaId: string; quantidade: number }[],
): Promise<FaltaEstoqueDTO[]> {
  if (itens.length === 0) return [];
  const pecas = await db.peca.findMany({
    where: { id: { in: itens.map((i) => i.pecaId) } },
    select: { id: true, nome: true, unidade: true, estoqueAtual: true },
  });
  const porId = new Map(pecas.map((p) => [p.id, p]));

  return itens.flatMap((item) => {
    const p = porId.get(item.pecaId);
    if (!p) return [];
    const disponivel = num(p.estoqueAtual);
    return disponivel < item.quantidade
      ? [{ pecaId: p.id, nome: p.nome, unidade: p.unidade, disponivel, necessario: item.quantidade }]
      : [];
  });
}
