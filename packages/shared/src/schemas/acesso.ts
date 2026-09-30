import { z } from 'zod';
import { PERFIS } from '../enums.js';
import {
  documentoOpcional,
  emailObrigatorio,
  emailOpcional,
  telefoneOpcional,
  texto,
  textoOpcional,
  versao,
} from './comum.js';

// Login, primeiro acesso, usuários e dados da oficina.

/**
 * 8 caracteres é o mínimo que as recomendações atuais (NIST) aceitam.
 * O teto de 72 é do bcrypt: o que passar disso seria ignorado em silêncio.
 */
export const senhaNova = z
  .string({ error: 'Informe a senha' })
  .min(8, 'A senha precisa ter ao menos 8 caracteres')
  .max(72, 'Senha longa demais (máximo 72 caracteres)');

export const loginSchema = z.object({
  email: emailObrigatorio,
  senha: z.string({ error: 'Informe a senha' }).min(1, 'Informe a senha').max(200),
});
export type LoginInput = z.input<typeof loginSchema>;

/** Só existe enquanto não há nenhum usuário: cria o primeiro Dono. */
export const primeiroAcessoSchema = z.object({
  oficinaNome: texto('Informe o nome da oficina', 120),
  nome: texto('Informe o seu nome', 80),
  email: emailObrigatorio,
  senha: senhaNova,
});
export type PrimeiroAcessoInput = z.input<typeof primeiroAcessoSchema>;

const usuarioBase = {
  nome: texto('Informe o nome', 80),
  email: emailObrigatorio,
  perfil: z.enum(PERFIS, { error: 'Escolha o perfil' }),
  /** % de comissão sobre a mão de obra das OS concluídas (mecânicos). */
  comissaoPct: z.number().min(0, 'Comissão inválida').max(100, 'Comissão inválida').nullable().optional(),
  versao,
};

export const criarUsuarioSchema = z.object({ ...usuarioBase, senha: senhaNova });
export type CriarUsuarioInput = z.input<typeof criarUsuarioSchema>;

export const atualizarUsuarioSchema = z.object(usuarioBase);
export type AtualizarUsuarioInput = z.input<typeof atualizarUsuarioSchema>;

export const redefinirSenhaSchema = z.object({ senha: senhaNova });

export const ativoSchema = z.object({ ativo: z.boolean() });

export const trocarSenhaSchema = z.object({
  senhaAtual: z.string({ error: 'Informe a senha atual' }).min(1, 'Informe a senha atual'),
  novaSenha: senhaNova,
});
export type TrocarSenhaInput = z.input<typeof trocarSenhaSchema>;

export const equipeQuery = z.object({ perfil: z.enum(PERFIS).optional() });

// ---- Oficina ---------------------------------------------------------------

export const oficinaSchema = z.object({
  nome: texto('Informe o nome da oficina', 120),
  subtitulo: textoOpcional(120),
  cnpj: documentoOpcional,
  telefone: telefoneOpcional,
  email: emailOpcional,
  endereco: textoOpcional(300),
  /** Logo em data URI. ~300 KB de imagem viram ~400 KB em base64. */
  logo: z
    .string()
    .max(420_000, 'Logo muito grande (máx. ~300 KB)')
    .refine((v) => v === '' || v.startsWith('data:image/'), 'Formato de imagem inválido')
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
  /** Texto no rodapé do orçamento e da OS (garantia, condições...). */
  observacoesDocumento: textoOpcional(1000),
  margemPadrao: z.number({ error: 'Informe a margem' }).min(0, 'Margem inválida').max(999, 'Margem inválida'),
  descontoMaxSemSenha: z
    .number({ error: 'Informe o limite de desconto' })
    .min(0, 'Limite inválido')
    .max(100, 'Limite inválido'),
  garantiaDias: z.number({ error: 'Informe a garantia' }).int().min(0, 'Garantia inválida').max(3650),
  validadeOrcamentoDias: z.number({ error: 'Informe a validade' }).int().min(1, 'Validade inválida').max(180),
  versao,
});
export type OficinaInput = z.input<typeof oficinaSchema>;
