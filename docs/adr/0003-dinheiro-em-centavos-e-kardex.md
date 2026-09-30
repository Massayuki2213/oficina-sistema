# 0003 — Dinheiro em centavos; estoque com kardex e trava de linha

**Situação:** aceita (v1.0)

## Contexto

Em ponto flutuante, 0,1 + 0,2 não dá 0,3. Num sistema que soma orçamento, divide parcela e
fecha caixa, o centavo perdido aparece no fim do mês e ninguém sabe de onde veio. No estoque,
duas OS lançando a mesma peça ao mesmo tempo liam o mesmo saldo e uma das baixas se perdia.

## Decisão

- Banco em `Decimal`; contas sempre por `@hermes/shared/dinheiro` (centavos inteiros, e a
  quantidade de peça em milésimos: 3,5 L). Parcela que não divide exato: o centavo vai para a
  última.
- Toda mudança de estoque é um **movimento** (entrada, saída, ajuste) com `saldoApos`
  (kardex). O cadastro da peça não edita a quantidade.
- Operações que mexem em saldo ou dinheiro travam a linha (`SELECT ... FOR UPDATE`) dentro da
  transação; o recebimento tem guarda de concorrência contra clique duplo.
- Custo médio ponderado recalculado a cada entrada com custo; a OS guarda o custo da peça no
  momento da baixa (o lucro de um mês fechado não muda quando o custo muda depois).

## Consequências

- O saldo de qualquer dia pode ser reconstruído e conferido pelo kardex.
- Um pouco mais de código em cada operação de estoque — concentrado em `src/dominio/estoque.ts`.
