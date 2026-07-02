import { z } from 'zod';

// Lançamento manual no livro-caixa (aporte, sangria, venda avulsa, etc.).
export const lancamentoSchema = z.object({
  tipo: z.enum(['ENTRADA', 'SAIDA']),
  descricao: z.string().min(2, 'Descreva o lançamento'),
  valor: z.coerce.number().positive('Valor deve ser maior que zero'),
  formaPagamento: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['A_VISTA', 'PIX', 'CARTAO', 'PARCELADO', 'FIADO']).optional(),
  ),
  categoria: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  origem: z.enum(['OS', 'VENDA_BALCAO', 'DESPESA', 'APORTE']).optional(),
});
export type LancamentoInput = z.infer<typeof lancamentoSchema>;
