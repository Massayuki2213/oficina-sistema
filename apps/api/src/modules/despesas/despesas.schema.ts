import { z } from 'zod';

const opcional = (schema: z.ZodString) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const createDespesaSchema = z.object({
  categoria: z.string().min(2, 'Informe a categoria (ex: aluguel, energia, peças)'),
  descricao: z.string().min(2, 'Descreva a despesa'),
  valor: z.coerce.number().positive('Valor deve ser maior que zero'),
  // Vencimento/data no formato YYYY-MM-DD (opcional; padrão = hoje).
  data: opcional(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD')),
  fornecedorId: opcional(z.string()),
  recorrente: z.boolean().optional().default(false),
  pago: z.boolean().optional().default(false),
});
export type CreateDespesaInput = z.infer<typeof createDespesaSchema>;

// Na edição não se mexe em "pago" (isso é a ação de pagar, que mexe no caixa).
export const updateDespesaSchema = createDespesaSchema.partial().omit({ pago: true });
export type UpdateDespesaInput = z.infer<typeof updateDespesaSchema>;
