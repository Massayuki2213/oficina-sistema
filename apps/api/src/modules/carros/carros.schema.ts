import { z } from 'zod';

// Normaliza a placa: maiúsculas e sem traço/espaço (ABC-1234 e abc1234 viram ABC1234).
export const normalizarPlaca = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, '');

const opcional = (schema: z.ZodString) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
const numeroOpcional = (schema: z.ZodNumber) =>
  z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().pipe(schema).optional());

export const createCarroSchema = z.object({
  clienteId: z.string().min(1, 'Selecione o cliente dono do veículo'),
  placa: z.string().min(1, 'Informe a placa').transform(normalizarPlaca),
  marca: z.string().min(1, 'Informe a marca'),
  modelo: z.string().min(1, 'Informe o modelo'),
  ano: numeroOpcional(z.number().int().min(1900).max(2100)),
  cor: opcional(z.string()),
  kmAtual: numeroOpcional(z.number().int().min(0)),
  chassi: opcional(z.string()),
  combustivel: opcional(z.string()),
  observacoes: opcional(z.string()),
});
export type CreateCarroInput = z.infer<typeof createCarroSchema>;

export const updateCarroSchema = createCarroSchema.partial();
export type UpdateCarroInput = z.infer<typeof updateCarroSchema>;
