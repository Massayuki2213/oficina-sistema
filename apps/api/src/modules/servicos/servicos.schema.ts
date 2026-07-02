import { z } from 'zod';

const opcional = (schema: z.ZodString) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
const numeroOpcional = (schema: z.ZodNumber) =>
  z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().pipe(schema).optional());

export const createServicoSchema = z.object({
  nome: z.string().min(2, 'Informe o nome do serviço'),
  descricao: opcional(z.string()),
  precoMaoDeObra: z.coerce.number().min(0, 'Preço da mão de obra inválido'),
  tempoEstimadoMin: numeroOpcional(z.number().int().min(0)),
  categoria: opcional(z.string()),
});
export type CreateServicoInput = z.infer<typeof createServicoSchema>;

export const updateServicoSchema = createServicoSchema.partial();
export type UpdateServicoInput = z.infer<typeof updateServicoSchema>;
