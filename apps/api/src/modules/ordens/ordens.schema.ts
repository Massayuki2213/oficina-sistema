import { z } from 'zod';

// Mudança de status da OS (o fluxo de trabalho na oficina).
export const mudarStatusSchema = z.object({
  status: z.enum(['EM_EXECUCAO', 'AGUARDANDO_PECA', 'CONCLUIDA', 'ENTREGUE', 'CANCELADA']),
});
export type MudarStatusInput = z.infer<typeof mudarStatusSchema>;

export const atribuirMecanicoSchema = z.object({
  mecanicoId: z.string().min(1, 'Informe o mecânico'),
});

// Receber pagamento (RN-11). Parcelado/fiado gera parcelas em Contas a Receber.
export const receberSchema = z.object({
  formaPagamento: z.enum(['A_VISTA', 'PIX', 'CARTAO', 'PARCELADO', 'FIADO']),
  parcelas: z.coerce.number().int().min(1).max(24).default(1),
  primeiroVencimentoDias: z.coerce.number().int().min(0).default(30),
});
export type ReceberInput = z.infer<typeof receberSchema>;
