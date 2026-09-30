import type { FormaPagamento, OrigemLancamento, Prisma, TipoLancamento } from '@prisma/client';

// ============================================================
// Livro-caixa — toda entrada e saída de dinheiro passa por aqui.
// Cada lançamento aponta para o que o originou (OS, parcela, despesa,
// compra, venda): é o que permite estornar e responder "de onde veio
// esse dinheiro?". Lançamento de caixa não se apaga: estorna-se.
// ============================================================

type Tx = Prisma.TransactionClient;

export interface NovoLancamento {
  tipo: TipoLancamento;
  origem: OrigemLancamento;
  descricao: string;
  valor: number;
  formaPagamento?: FormaPagamento | null;
  categoria?: string | null;
  data?: Date;
  usuarioId?: string | null;
  osId?: string | null;
  contaReceberId?: string | null;
  despesaId?: string | null;
  compraId?: string | null;
  vendaId?: string | null;
}

export function lancar(tx: Tx, l: NovoLancamento) {
  if (!(l.valor > 0)) throw new Error(`Lançamento de caixa com valor inválido: ${l.valor}`);
  return tx.lancamentoCaixa.create({
    data: {
      tipo: l.tipo,
      origem: l.origem,
      descricao: l.descricao,
      valor: l.valor,
      formaPagamento: l.formaPagamento ?? null,
      categoria: l.categoria ?? null,
      ...(l.data ? { data: l.data } : {}),
      usuarioId: l.usuarioId ?? null,
      osId: l.osId ?? null,
      contaReceberId: l.contaReceberId ?? null,
      despesaId: l.despesaId ?? null,
      compraId: l.compraId ?? null,
      vendaId: l.vendaId ?? null,
    },
  });
}

/**
 * Faturamento, despesa e lucro olham a ORIGEM, não só o tipo:
 *  - receita = entradas de OS e balcão, menos estornos;
 *  - despesa = saídas de despesa (inclui compra de peças paga);
 *  - aporte e retirada são dinheiro do dono — ficam fora do lucro.
 */
export const ORIGENS_RECEITA: OrigemLancamento[] = ['OS', 'VENDA_BALCAO'];
export const ORIGENS_DESPESA: OrigemLancamento[] = ['DESPESA'];
