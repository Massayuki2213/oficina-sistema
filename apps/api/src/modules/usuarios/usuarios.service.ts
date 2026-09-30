import bcrypt from 'bcryptjs';
import type { Usuario } from '@prisma/client';
import type { z } from 'zod';
import type { MembroEquipeDTO, Perfil, UsuarioDTO } from '@hermes/shared';
import type { atualizarUsuarioSchema, criarUsuarioSchema } from '@hermes/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { conflito, invalido, naoEncontrado } from '../../lib/errors.js';
import { numOuNull } from '../../lib/dinheiro.js';
import { isoOuNull } from '../../lib/datas.js';
import { contarPorUsuario, encerrarDoUsuario } from '../../lib/sessoes.js';
import { falhaDeVersao, naVersao, proximaVersao } from '../../lib/versao.js';
import { hashSenha } from '../auth/auth.service.js';

// ============================================================
// Gestão de usuários — quem entra no sistema e com qual perfil.
//
// Duas travas de segurança da oficina:
//  - o último Dono ativo não pode ser rebaixado nem inativado
//    (senão ninguém mais administra o sistema);
//  - ninguém corta o próprio acesso.
//
// Trocar/redefinir senha e inativar apagam as sessões da pessoa:
// qualquer aparelho aberto com a senha antiga cai na hora.
// ============================================================

function paraDTO(u: Usuario, sessoesAtivas = 0): UsuarioDTO {
  return {
    id: u.id,
    versao: u.versao,
    nome: u.nome,
    email: u.email,
    perfil: u.perfil,
    ativo: u.ativo,
    comissaoPct: numOuNull(u.comissaoPct),
    criadoEm: u.criadoEm.toISOString(),
    ultimoAcesso: isoOuNull(u.ultimoAcesso),
    sessoesAtivas,
  };
}

/** Todos, inclusive inativos — é a tela de administração do Dono. */
export async function listar(): Promise<UsuarioDTO[]> {
  const [usuarios, sessoes] = await Promise.all([
    prisma.usuario.findMany({ orderBy: [{ ativo: 'desc' }, { nome: 'asc' }] }),
    contarPorUsuario(),
  ]);
  return usuarios.map((u) => paraDTO(u, sessoes.get(u.id) ?? 0));
}

/** Quem está ativo, para escolher o mecânico da OS. Sem e-mail: não precisa. */
export async function equipe(perfil?: Perfil): Promise<MembroEquipeDTO[]> {
  return prisma.usuario.findMany({
    where: { ativo: true, ...(perfil ? { perfil } : {}) },
    select: { id: true, nome: true, perfil: true },
    orderBy: { nome: 'asc' },
  });
}

async function garantirQueSobraUmDono(alvo: Usuario) {
  if (alvo.perfil !== 'DONO' || !alvo.ativo) return;
  const donosAtivos = await prisma.usuario.count({ where: { perfil: 'DONO', ativo: true } });
  if (donosAtivos <= 1) {
    throw conflito('Este é o único Dono ativo. Promova outro usuário a Dono antes de alterar este.');
  }
}

async function buscar(id: string) {
  const u = await prisma.usuario.findUnique({ where: { id } });
  if (!u) throw naoEncontrado('Usuário não encontrado');
  return u;
}

export async function criar(dados: z.output<typeof criarUsuarioSchema>): Promise<UsuarioDTO> {
  const u = await prisma.usuario.create({
    data: {
      nome: dados.nome,
      email: dados.email,
      perfil: dados.perfil,
      comissaoPct: dados.comissaoPct ?? null,
      senhaHash: await hashSenha(dados.senha),
    },
  });
  return paraDTO(u);
}

export async function atualizar(id: string, dados: z.output<typeof atualizarUsuarioSchema>, quemPediu: string) {
  const alvo = await buscar(id);
  if (alvo.perfil === 'DONO' && dados.perfil !== 'DONO') {
    if (id === quemPediu) throw conflito('Você não pode tirar o seu próprio perfil de Dono.');
    await garantirQueSobraUmDono(alvo);
  }
  const r = await prisma.usuario.updateMany({
    where: { id, ...naVersao(dados.versao) },
    data: { nome: dados.nome, email: dados.email, perfil: dados.perfil, comissaoPct: dados.comissaoPct ?? null, ...proximaVersao },
  });
  if (r.count === 0) await falhaDeVersao('usuarios', id, true, 'Usuário não encontrado');
  return paraDTO(await buscar(id), (await contarPorUsuario()).get(id) ?? 0);
}

/** O Dono redefine a senha de quem esqueceu. As sessões dessa pessoa caem. */
export async function redefinirSenha(id: string, senha: string) {
  await buscar(id);
  await prisma.usuario.update({ where: { id }, data: { senhaHash: await hashSenha(senha) } });
  await encerrarDoUsuario(id);
}

/**
 * O Dono derruba os aparelhos de alguém (celular perdido, computador de
 * outra pessoa que ficou logado). A senha continua a mesma.
 */
export async function encerrarSessoes(id: string): Promise<{ encerradas: number }> {
  await buscar(id);
  return { encerradas: await encerrarDoUsuario(id) };
}

/** Inativar é o "excluir" daqui: o histórico (OS, caixa) aponta para o usuário. */
export async function definirAtivo(id: string, ativo: boolean, quemPediu: string): Promise<UsuarioDTO> {
  const alvo = await buscar(id);
  if (!ativo) {
    if (id === quemPediu) throw conflito('Você não pode inativar o seu próprio usuário.');
    await garantirQueSobraUmDono(alvo);
  }
  const u = await prisma.usuario.update({ where: { id }, data: { ativo } });
  if (!ativo) await encerrarDoUsuario(id);
  return paraDTO(u);
}

/**
 * Troca da própria senha — exige a atual. TODAS as sessões da pessoa caem,
 * inclusive esta: quem chama abre uma nova (token novo depois de mudar a
 * credencial), para ela continuar trabalhando.
 */
export async function trocarPropriaSenha(id: string, senhaAtual: string, novaSenha: string) {
  const u = await buscar(id);
  if (!(await bcrypt.compare(senhaAtual, u.senhaHash))) throw invalido('A senha atual está incorreta');
  if (senhaAtual === novaSenha) throw invalido('A nova senha precisa ser diferente da atual');

  await prisma.usuario.update({ where: { id }, data: { senhaHash: await hashSenha(novaSenha) } });
  await encerrarDoUsuario(id);
  return { id };
}
