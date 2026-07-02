import { z } from 'zod';

// Trata string vazia como "não informado".
const opcional = (schema: z.ZodString) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const createPecaSchema = z.object({
  nome: z.string().min(2, 'Informe o nome da peça'),
  codigoBarras: opcional(z.string()),
  sku: opcional(z.string()),
  tipo: z.enum(['PECA', 'PRODUTO']).default('PECA'),
  fornecedorId: opcional(z.string()),
  precoCusto: z.coerce.number().min(0, 'Custo inválido'),
  precoVenda: z.coerce.number().min(0, 'Preço de venda inválido'),
  estoqueAtual: z.coerce.number().int().min(0).default(0),
  estoqueMinimo: z.coerce.number().int().min(0).default(0),
  unidade: z.string().default('un'),
  localizacao: opcional(z.string()),
});
export type CreatePecaInput = z.infer<typeof createPecaSchema>;

export const updatePecaSchema = createPecaSchema.partial();
export type UpdatePecaInput = z.infer<typeof updatePecaSchema>;

// Entrada de estoque (recebimento de mercadoria / leitura no balcão).
export const entradaEstoqueSchema = z.object({
  quantidade: z.coerce.number().int().positive('Quantidade deve ser maior que zero'),
  custoUnit: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.coerce.number().min(0).optional(),
  ),
  motivo: opcional(z.string()),
});
export type EntradaEstoqueInput = z.infer<typeof entradaEstoqueSchema>;
