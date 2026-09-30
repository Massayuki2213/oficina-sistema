import type { Prisma } from '@prisma/client';

// O banco guarda dinheiro e quantidade em DECIMAL (exato). O Prisma os
// entrega como objetos Decimal; aqui eles viram number para o contrato
// JSON. As contas em si são feitas pelas funções de @hermes/shared
// (centavos/milésimos), nunca somando number solto.

type Decimalizavel = Prisma.Decimal | number | string;

export const num = (v: Decimalizavel | null | undefined): number => (v == null ? 0 : Number(v));

export const numOuNull = (v: Decimalizavel | null | undefined): number | null => (v == null ? null : Number(v));

export {
  arredondar,
  arredondarQtd,
  brl,
  deCentavos,
  dividirEmParcelas,
  formatarQtd,
  multiplicar,
  paraCentavos,
  percentual,
  somar,
  somarQtd,
  subtrair,
} from '@hermes/shared';
