// ============================================================
// Dinheiro e quantidade — contas em inteiros.
//
// 0,1 + 0,2 não dá 0,3 em ponto flutuante. Num sistema que soma
// orçamento, divide parcela e fecha caixa, esse centavo perdido
// aparece no fim do mês e ninguém sabe de onde veio. Por isso toda
// conta passa por centavos (dinheiro) e milésimos (quantidade), que
// são inteiros, e só volta a ser "reais" na saída.
//
// O mesmo arquivo roda na tela (prévia do orçamento) e no servidor
// (o valor que vale): os dois arredondam do mesmo jeito.
// ============================================================

/** Empurrão mínimo contra o 1,005 × 100 = 100,4999... do ponto flutuante. */
const EMPURRAO = 1e-7;

const arredondarInteiro = (v: number) => Math.round(v + (v >= 0 ? EMPURRAO : -EMPURRAO));

/** R$ → centavos inteiros. Aceita o Decimal do banco convertido em number/string. */
export const paraCentavos = (reais: number | string): number => arredondarInteiro(Number(reais) * 100);

/** Centavos → R$. */
export const deCentavos = (centavos: number): number => centavos / 100;

/** Arredonda um valor em reais para 2 casas (arredondamento comercial). */
export const arredondar = (reais: number | string): number => deCentavos(paraCentavos(reais));

/** Soma valores em reais sem perder centavo. */
export const somar = (...valores: (number | string)[]): number =>
  deCentavos(valores.reduce<number>((acc, v) => acc + paraCentavos(v), 0));

/** Diferença a − b em reais, exata no centavo. */
export const subtrair = (a: number | string, b: number | string): number => deCentavos(paraCentavos(a) - paraCentavos(b));

/**
 * Preço unitário × quantidade (a quantidade pode ser fracionada: 3,5 L de óleo).
 * O resultado é arredondado ao centavo — é o valor da linha no documento.
 */
export const multiplicar = (precoUnit: number | string, quantidade: number | string): number =>
  deCentavos(arredondarInteiro(paraCentavos(precoUnit) * Number(quantidade)));

/**
 * Divide um total em parcelas que somam EXATAMENTE o total.
 * O centavo que sobra da divisão vai para a última parcela.
 */
export function dividirEmParcelas(total: number | string, parcelas: number): number[] {
  if (!Number.isInteger(parcelas) || parcelas < 1) throw new Error('Número de parcelas inválido');
  const centavos = paraCentavos(total);
  const base = Math.floor(centavos / parcelas);
  return Array.from({ length: parcelas }, (_, i) =>
    deCentavos(i === parcelas - 1 ? centavos - base * (parcelas - 1) : base),
  );
}

/** Percentual de `parte` sobre `todo` (0 quando o todo é zero). */
export const percentual = (parte: number, todo: number): number => (todo > 0 ? (parte / todo) * 100 : 0);

const formatoBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 1234.5 → "R$ 1.234,50". */
export const brl = (reais: number | string): string => formatoBRL.format(Number(reais) || 0);

// ---- Quantidade (peças podem ser fracionadas: litro, metro) ----------------

/** Até 3 casas: 3,5 L; 1,25 m. */
export const arredondarQtd = (q: number | string): number => arredondarInteiro(Number(q) * 1000) / 1000;

/** Soma quantidades sem erro de ponto flutuante. */
export const somarQtd = (...qs: (number | string)[]): number =>
  qs.reduce<number>((acc, q) => acc + arredondarInteiro(Number(q) * 1000), 0) / 1000;

const formatoQtd = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

/** 3.5 + "L" → "3,5 L". */
export const formatarQtd = (q: number | string, unidade?: string | null): string =>
  `${formatoQtd.format(Number(q) || 0)}${unidade ? ` ${unidade}` : ''}`;
