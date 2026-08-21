import bcrypt from 'bcryptjs';
import type { PerfilUsuario } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

const SALT_ROUNDS = 10;

// Lista usuários ativos (sem o hash da senha). Filtra por perfil quando informado.
// Usado, p.ex., para preencher o seletor de mecânicos ao atribuir uma OS.
export function listUsuarios(perfil?: PerfilUsuario) {
  return prisma.usuario.findMany({
    where: { ativo: true, ...(perfil ? { perfil } : {}) },
    select: { id: true, nome: true, email: true, perfil: true },
    orderBy: { nome: 'asc' },
  });
}

// Gera o hash de uma senha (usado no cadastro de usuário e no seed).
export function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, SALT_ROUNDS);
}

// Valida e-mail + senha. Retorna o usuário (sem o hash) ou null.
export async function validarCredenciais(email: string, senha: string) {
  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario || !usuario.ativo) return null;

  const confere = await bcrypt.compare(senha, usuario.senhaHash);
  if (!confere) return null;

  return usuario;
}

/**
 * RN-08: confere se a senha informada é de ALGUM Dono ativo.
 *
 * Não pede o e-mail de propósito: no balcão, quem autoriza o desconto é o dono
 * que está por perto, e digitar só a senha é o gesto rápido que a regra pede.
 */
export async function conferirSenhaDeDono(senha: string): Promise<boolean> {
  if (!senha) return false;
  const donos = await prisma.usuario.findMany({ where: { perfil: 'DONO', ativo: true }, select: { senhaHash: true } });
  for (const dono of donos) {
    if (await bcrypt.compare(senha, dono.senhaHash)) return true;
  }
  return false;
}
