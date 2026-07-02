import { z } from 'zod';

// Validação de entrada do módulo de clientes (Zod).
// Campos espelham o modelo CLIENTE da seção 4 do PLANEJAMENTO.md.

// Trata string vazia como "não informado" (vira undefined -> NULL no banco).
const opcional = (schema: z.ZodString) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const createClienteSchema = z.object({
  nome: z.string().min(2, 'Informe o nome do cliente'),
  tipo: z.enum(['PF', 'PJ']).default('PF'),
  cpfCnpj: opcional(z.string()),
  telefone: opcional(z.string()),
  whatsapp: opcional(z.string()),
  email: opcional(z.string().email('E-mail inválido')),
  endereco: opcional(z.string()),
  observacoes: opcional(z.string()),
});
export type CreateClienteInput = z.infer<typeof createClienteSchema>;

export const updateClienteSchema = createClienteSchema.partial();
export type UpdateClienteInput = z.infer<typeof updateClienteSchema>;
