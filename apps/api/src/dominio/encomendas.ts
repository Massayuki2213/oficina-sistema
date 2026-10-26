import type { Prisma } from '@prisma/client';
import { arredondar, multiplicar, num, somar, somarQtd } from '../lib/dinheiro.js';

// ============================================================
// Encomenda (RN-03) — a peça que a OS usou antes de ela chegar.
//
// A oficina trabalha com pouco estoque: a peça entra na OS quando o
// cliente aprova, a lista vai para a autopeça e a compra traz a peça.
// Cada linha de peça da OS guarda quanto faltou (`encomenda`). A compra
// que traz a peça "atende" a linha: ela sai da lista e passa a ter o
// custo da nota — o custo médio de antes não era o desta peça.
// ============================================================

type Tx = Prisma.TransactionClient;

/** Linha esperando peça: faltou no estoque e nenhuma compra trouxe ainda. OS cancelada já devolveu tudo. */
export const encomendaPendente = {
  encomenda: { gt: 0 },
  compraItemId: null,
  os: { status: { not: 'CANCELADA' } },
} satisfies Prisma.OSPecaWhereInput;

export interface ItemQueChegou {
  pecaId: string;
  quantidade: number;
  custoUnit: number;
  compraItemId: string;
  fornecedorId: string;
}

export interface EncomendaAtendida {
  os: { id: string; numero: number };
  quantidade: number;
}

/**
 * A compra chegou: atende as encomendas desta peça até onde a quantidade dá.
 * Primeiro as que foram pedidas a este distribuidor, depois as das OS mais
 * antigas. Uma linha só sai da lista quando chega tudo o que ela encomendou.
 */
export async function atenderEncomendas(tx: Tx, item: ItemQueChegou): Promise<EncomendaAtendida[]> {
  const pendentes = await tx.oSPeca.findMany({
    where: { pecaId: item.pecaId, ...encomendaPendente },
    include: { os: { select: { id: true, numero: true } } },
  });
  const desteDistribuidor = (l: (typeof pendentes)[number]) => (l.pedidoFornecedorId === item.fornecedorId ? 0 : 1);
  pendentes.sort((a, b) => desteDistribuidor(a) - desteDistribuidor(b) || a.os.numero - b.os.numero || a.id.localeCompare(b.id));

  let resta = item.quantidade;
  const atendidas: EncomendaAtendida[] = [];
  for (const linha of pendentes) {
    const encomenda = num(linha.encomenda);
    if (encomenda > resta) continue;

    // A parte que saiu da prateleira fica com o custo de antes; a encomendada, com o da nota.
    const quantidade = num(linha.quantidade);
    const custoUnit = arredondar(
      somar(multiplicar(num(linha.custoUnit), somarQtd(quantidade, -encomenda)), multiplicar(item.custoUnit, encomenda)) / quantidade,
    );
    await tx.oSPeca.update({ where: { id: linha.id }, data: { compraItemId: item.compraItemId, custoUnit } });

    atendidas.push({ os: linha.os, quantidade: encomenda });
    resta = somarQtd(resta, -encomenda);
    if (resta <= 0) break;
  }
  return atendidas;
}
