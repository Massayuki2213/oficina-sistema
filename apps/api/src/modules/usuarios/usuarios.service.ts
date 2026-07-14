import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import { hashSenha } from '../auth/auth.service.js';
import type { CreateUsuarioInput, UpdateUsuarioInput } from './usuarios.schema.js';

// ============================================================
// Gestão de usuários (Fase 6) — tira a oficina da senha padrão
// e permite criar/editar quem entra no sistema.
// ============================================================

const semSenha = { id: true, nome: true, email: true, perfil: true, ativo: true, criadoEm: true } as const;

/** Lista todos (inclusive inativos) — é a tela de administração do Dono. */
export function listUsuarios() {
  return prisma.usuario.findMany({ select: semSenha, orderBy: [{ ativo: 'desc' }, { nome: 'asc' }] });
}

function emailDuplicado(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
function naoEncontrado(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}

/**
 * A oficina não pode ficar sem ninguém que administre o sistema: se este é o
 * último Dono ativo, ele não pode ser rebaixado nem inativado.
 */
async function garantirQueSobraUmDono(id: string) {
  const alvo = await prisma.usuario.findUnique({ where: { id } });
  if (!alvo) throw new AppError(404, 'Usuário não encontrado');
  if (alvo.perfil !== 'DONO' || !alvo.ativo) return;

  const donosAtivos = await prisma.usuario.count({ where: { perfil: 'DONO', ativo: true } });
  if (donosAtivos <= 1) {
    throw new AppError(409, 'Este é o único Dono ativo. Promova outro usuário a Dono antes de alterar este.');
  }
}

export async function createUsuario(data: CreateUsuarioInput) {
  try {
    return await prisma.usuario.create({
      data: {
        nome: data.nome,
        email: data.email,
        perfil: data.perfil,
        senhaHash: await hashSenha(data.senha),
      },
      select: semSenha,
    });
  } catch (err) {
    if (emailDuplicado(err)) throw new AppError(409, 'Já existe um usuário com esse e-mail');
    throw err;
  }
}

export async function updateUsuario(id: string, data: UpdateUsuarioInput) {
  const alvo = await prisma.usuario.findUnique({ where: { id } });
  if (!alvo) throw new AppError(404, 'Usuário não encontrado');

  // Rebaixar o último Dono deixaria o sistema sem administrador.
  if (alvo.perfil === 'DONO' && data.perfil !== 'DONO') await garantirQueSobraUmDono(id);

  try {
    return await prisma.usuario.update({ where: { id }, data, select: semSenha });
  } catch (err) {
    if (emailDuplicado(err)) throw new AppError(409, 'Já existe um usuário com esse e-mail');
    if (naoEncontrado(err)) throw new AppError(404, 'Usuário não encontrado');
    throw err;
  }
}

/** O Dono redefine a senha de quem esqueceu (não pede a senha antiga). */
export async function resetSenha(id: string, senha: string) {
  try {
    await prisma.usuario.update({ where: { id }, data: { senhaHash: await hashSenha(senha) } });
  } catch (err) {
    if (naoEncontrado(err)) throw new AppError(404, 'Usuário não encontrado');
    throw err;
  }
}

/** Inativar é o "excluir" daqui: o histórico (OS, caixa) aponta para o usuário. */
export async function setAtivo(id: string, ativo: boolean, quemPediu: string) {
  if (!ativo) {
    if (id === quemPediu) throw new AppError(409, 'Você não pode inativar o seu próprio usuário');
    await garantirQueSobraUmDono(id);
  }
  try {
    return await prisma.usuario.update({ where: { id }, data: { ativo }, select: semSenha });
  } catch (err) {
    if (naoEncontrado(err)) throw new AppError(404, 'Usuário não encontrado');
    throw err;
  }
}

/** Troca da própria senha — exige confirmar a senha atual. */
export async function trocarPropriaSenha(id: string, senhaAtual: string, novaSenha: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id } });
  if (!usuario) throw new AppError(404, 'Usuário não encontrado');

  const confere = await bcrypt.compare(senhaAtual, usuario.senhaHash);
  if (!confere) throw new AppError(400, 'A senha atual está incorreta');

  await prisma.usuario.update({ where: { id }, data: { senhaHash: await hashSenha(novaSenha) } });
}
