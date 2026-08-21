import { z } from 'zod';

const opcional = (s: z.ZodString) => z.preprocess((v) => (v === '' ? null : v), s.nullable().optional());

export const updateOficinaSchema = z.object({
  nome: z.string().min(1, 'Informe o nome da oficina'),
  subtitulo: opcional(z.string()),
  cnpj: opcional(z.string()),
  telefone: opcional(z.string()),
  email: opcional(z.string()),
  endereco: opcional(z.string()),
  // Logo em data URI. Limite de ~400 KB para não estourar a linha do banco
  // nem pesar o cabeçalho do documento impresso.
  logo: opcional(z.string().max(400_000, 'Logo muito grande (máx. ~300 KB de imagem)')),
  margemPadrao: z.coerce.number().min(0).max(999).default(80),
  descontoMaxSemSenha: z.coerce.number().min(0).max(100).default(10),
  garantiaDias: z.coerce.number().int().min(0).max(365).default(15),
});
export type UpdateOficinaInput = z.infer<typeof updateOficinaSchema>;
