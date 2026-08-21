import { z } from 'zod';

const itemServico = z.object({
  servicoId: z.string().min(1),
  quantidade: z.coerce.number().int().positive().default(1),
});
const itemPeca = z.object({
  pecaId: z.string().min(1),
  quantidade: z.coerce.number().int().positive().default(1),
});

const livre = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());

export const createOrcamentoSchema = z
  .object({
    // ORÇAMENTO RÁPIDO: sem cliente e sem veículo cadastrados. Quem só quer
    // saber um preço não passa por dois cadastros antes de ouvir o valor.
    clienteId: livre,
    carroId: livre,
    // Identificação solta, só para saber de quem era quando o cliente voltar.
    contatoNome: livre,
    contatoTelefone: livre,
    veiculoDescricao: livre,
    validadeDias: z.coerce.number().int().positive().default(15),
    desconto: z.coerce.number().min(0).default(0),
    // RN-08: desconto acima do teto configurado exige a senha do Dono.
    // Vai no corpo e nunca é gravado — a auditoria mascara este campo.
    senhaDono: z.string().optional(),
    observacoes: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
    servicos: z.array(itemServico).default([]),
    pecas: z.array(itemPeca).default([]),
  })
  // RN-10: precisa de ao menos 1 serviço ou 1 peça.
  .refine((d) => d.servicos.length + d.pecas.length > 0, {
    message: 'Adicione ao menos 1 serviço ou peça',
    path: ['servicos'],
  })
  // Veículo cadastrado sempre tem dono: aceitar carro sem cliente deixaria o
  // orçamento num meio-termo que nem o rápido nem o completo sabem tratar.
  .refine((d) => !d.carroId || !!d.clienteId, {
    message: 'Selecione o cliente dono deste veículo',
    path: ['clienteId'],
  });
export type CreateOrcamentoInput = z.infer<typeof createOrcamentoSchema>;

/**
 * Identifica um orçamento rápido: amarra a um cliente e veículo de verdade.
 * É o que transforma "aquele preço que passei por telefone" num orçamento
 * completo, sem redigitar os itens.
 */
export const identificarSchema = z.object({
  clienteId: z.string().min(1, 'Selecione o cliente'),
  carroId: z.string().min(1, 'Selecione o veículo'),
});
export type IdentificarInput = z.infer<typeof identificarSchema>;

// Mudança de status manual (enviar/recusar/rascunho). Aprovar tem rota própria.
export const statusOrcamentoSchema = z.object({
  status: z.enum(['RASCUNHO', 'ENVIADO', 'RECUSADO', 'EXPIRADO']),
});
export type StatusOrcamentoInput = z.infer<typeof statusOrcamentoSchema>;

// Corpo opcional ao aprovar: já atribuir um mecânico à OS.
// Um orçamento rápido também informa aqui o cliente e o veículo — se o serviço
// vai ser feito, o carro está na oficina, e a OS precisa saber em qual mexeu.
export const aprovarSchema = z.object({
  mecanicoId: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  clienteId: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  carroId: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
});
