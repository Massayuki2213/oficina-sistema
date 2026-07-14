import { z } from 'zod';
import { PERFIS } from '@hermes/shared';

// Senha curta é o mesmo que senha nenhuma numa oficina onde o PC fica no balcão.
const senha = z.string().min(6, 'A senha precisa ter ao menos 6 caracteres');

export const createUsuarioSchema = z.object({
  nome: z.string().min(1, 'Informe o nome'),
  email: z.string().email('E-mail inválido'),
  perfil: z.enum(PERFIS),
  senha,
});
export type CreateUsuarioInput = z.infer<typeof createUsuarioSchema>;

export const updateUsuarioSchema = z.object({
  nome: z.string().min(1, 'Informe o nome'),
  email: z.string().email('E-mail inválido'),
  perfil: z.enum(PERFIS),
});
export type UpdateUsuarioInput = z.infer<typeof updateUsuarioSchema>;

/** O Dono redefine a senha de alguém (quem esqueceu não precisa da senha antiga). */
export const resetSenhaSchema = z.object({ senha });

export const ativoSchema = z.object({ ativo: z.boolean() });

/** Qualquer um troca a própria senha — aí sim confirmando a atual. */
export const trocarSenhaSchema = z.object({
  senhaAtual: z.string().min(1, 'Informe a senha atual'),
  novaSenha: senha,
});
export type TrocarSenhaInput = z.infer<typeof trocarSenhaSchema>;
