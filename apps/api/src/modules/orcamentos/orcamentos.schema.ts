import { z } from 'zod';

const itemServico = z.object({
  servicoId: z.string().min(1),
  quantidade: z.coerce.number().int().positive().default(1),
});
const itemPeca = z.object({
  pecaId: z.string().min(1),
  quantidade: z.coerce.number().int().positive().default(1),
});

export const createOrcamentoSchema = z
  .object({
    clienteId: z.string().min(1, 'Selecione o cliente'),
    carroId: z.string().min(1, 'Selecione o veículo'),
    validadeDias: z.coerce.number().int().positive().default(15),
    desconto: z.coerce.number().min(0).default(0),
    observacoes: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
    servicos: z.array(itemServico).default([]),
    pecas: z.array(itemPeca).default([]),
  })
  // RN-10: precisa de ao menos 1 serviço ou 1 peça.
  .refine((d) => d.servicos.length + d.pecas.length > 0, {
    message: 'Adicione ao menos 1 serviço ou peça',
    path: ['servicos'],
  });
export type CreateOrcamentoInput = z.infer<typeof createOrcamentoSchema>;

// Mudança de status manual (enviar/recusar/rascunho). Aprovar tem rota própria.
export const statusOrcamentoSchema = z.object({
  status: z.enum(['RASCUNHO', 'ENVIADO', 'RECUSADO', 'EXPIRADO']),
});
export type StatusOrcamentoInput = z.infer<typeof statusOrcamentoSchema>;

// Corpo opcional ao aprovar: já atribuir um mecânico à OS.
export const aprovarSchema = z.object({
  mecanicoId: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
});
