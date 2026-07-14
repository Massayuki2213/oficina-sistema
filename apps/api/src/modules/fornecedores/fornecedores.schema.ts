import { z } from 'zod';

const opcional = (schema: z.ZodString) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const createFornecedorSchema = z.object({
  nome: z.string().min(2, 'Informe o nome do distribuidor'),
  cnpj: opcional(z.string()),
  contato: opcional(z.string()),
  telefone: opcional(z.string()),
  prazoEntrega: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.coerce.number().int().nonnegative().optional(),
  ),
  observacoes: opcional(z.string()),
});
export type CreateFornecedorInput = z.infer<typeof createFornecedorSchema>;

export const updateFornecedorSchema = createFornecedorSchema;
export type UpdateFornecedorInput = z.infer<typeof updateFornecedorSchema>;
