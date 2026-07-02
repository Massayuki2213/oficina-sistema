import { z } from 'zod';

const opcional = (s: z.ZodString) => z.preprocess((v) => (v === '' ? undefined : v), s.optional());
const dataHoraValida = (v: string) => !Number.isNaN(Date.parse(v));

export const createVisitaSchema = z.object({
  clienteId: z.string().min(1, 'Selecione o cliente'),
  carroId: opcional(z.string()),
  // Aceita o formato do <input type="datetime-local"> (ex: "2026-07-05T14:30").
  dataHora: z.string().min(1, 'Informe a data e a hora').refine(dataHoraValida, 'Data/hora inválida'),
  tipo: z.enum(['REVISAO', 'RETORNO', 'ORCAMENTO', 'GARANTIA']).default('REVISAO'),
  observacoes: opcional(z.string()),
});
export type CreateVisitaInput = z.infer<typeof createVisitaSchema>;

export const statusVisitaSchema = z.object({
  status: z.enum(['AGENDADA', 'CONFIRMADA', 'REALIZADA', 'FALTOU']),
});

export const updateVisitaSchema = z.object({
  carroId: opcional(z.string()),
  dataHora: z.preprocess((v) => (v === '' ? undefined : v), z.string().refine(dataHoraValida, 'Data/hora inválida').optional()),
  tipo: z.enum(['REVISAO', 'RETORNO', 'ORCAMENTO', 'GARANTIA']).optional(),
  observacoes: opcional(z.string()),
});
export type UpdateVisitaInput = z.infer<typeof updateVisitaSchema>;
