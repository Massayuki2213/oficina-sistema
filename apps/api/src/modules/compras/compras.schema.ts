import { z } from 'zod';

const opcional = (schema: z.ZodString) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

// Um item da compra referencia uma peça existente (pecaId) OU cadastra uma nova
// na hora (pecaNova). Exatamente um dos dois — validado no refine abaixo.
const itemCompra = z
  .object({
    pecaId: opcional(z.string()),
    pecaNova: z
      .object({
        nome: z.string().min(2, 'Informe o nome da peça'),
        precoVenda: z.coerce.number().nonnegative('Preço de venda inválido'),
      })
      .optional(),
    quantidade: z.coerce.number().int().positive('Quantidade deve ser maior que zero'),
    custoUnit: z.coerce.number().nonnegative('Custo inválido'),
  })
  .refine((i) => !!i.pecaId !== !!i.pecaNova, {
    message: 'Escolha uma peça existente ou cadastre uma nova (um dos dois)',
    path: ['pecaId'],
  });

export const createCompraSchema = z.object({
  fornecedorId: z.string().min(1, 'Selecione o distribuidor'),
  data: opcional(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD')),
  numeroNota: opcional(z.string()),
  observacoes: opcional(z.string()),
  // Já paga = compra à vista (sai do caixa na hora). Padrão: a prazo (dívida).
  pago: z.boolean().optional().default(false),
  itens: z.array(itemCompra).min(1, 'Adicione ao menos um item à compra'),
});
export type CreateCompraInput = z.infer<typeof createCompraSchema>;
