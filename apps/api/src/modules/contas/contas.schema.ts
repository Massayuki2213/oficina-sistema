import { z } from 'zod';

// Ao dar baixa numa parcela, ela é quitada em dinheiro/PIX/cartão (não gera novo fiado).
export const receberParcelaSchema = z.object({
  formaPagamento: z.enum(['A_VISTA', 'PIX', 'CARTAO']).default('A_VISTA'),
});
export type ReceberParcelaInput = z.infer<typeof receberParcelaSchema>;
