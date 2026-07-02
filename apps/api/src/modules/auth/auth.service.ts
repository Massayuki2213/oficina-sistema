import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma.js';

const SALT_ROUNDS = 10;

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
