import bcrypt from 'bcryptjs';
import type { z } from 'zod';
import type { primeiroAcessoSchema } from '@hermes/shared/schemas';
import { VERSAO, type SituacaoSistema } from '@hermes/shared';
import { prisma } from '../../lib/prisma.js';
import { conflito, COD } from '../../lib/errors.js';

/** Custo do bcrypt: 10 é o mínimo recomendado (OWASP) e fica ~100 ms por login. */
const CUSTO_BCRYPT = 10;

export function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, CUSTO_BCRYPT);
}

/**
 * Hash de uma senha que ninguém tem. Com e-mail inexistente, a comparação
 * roda contra ele mesmo assim: o tempo de resposta não entrega quais
 * e-mails existem no sistema.
 */
const HASH_FANTASMA = bcrypt.hashSync('senha-que-nao-existe', CUSTO_BCRYPT);

/** Valida e-mail + senha. Devolve o usuário ativo, ou null. */
export async function validarCredenciais(email: string, senha: string) {
  const usuario = await prisma.usuario.findUnique({ where: { email } });
  const confere = await bcrypt.compare(senha, usuario?.senhaHash ?? HASH_FANTASMA);
  if (!usuario || !confere || !usuario.ativo) return null;

  await prisma.usuario.update({ where: { id: usuario.id }, data: { ultimoAcesso: new Date() } });
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

/** O que a tela de entrada precisa saber antes de alguém entrar. */
export async function situacao(): Promise<SituacaoSistema> {
  const [usuarios, oficina] = await Promise.all([
    prisma.usuario.count(),
    prisma.oficina.findUnique({ where: { id: 'unica' }, select: { nome: true, logo: true } }),
  ]);
  return {
    versao: VERSAO,
    precisaConfigurar: usuarios === 0,
    oficina: { nome: oficina?.nome ?? 'Hermes', logo: oficina?.logo ?? null },
  };
}

/**
 * Primeiro acesso: cria o Dono e dá nome à oficina. Só funciona com o banco
 * sem nenhum usuário — assim uma instalação nova nunca nasce com senha padrão.
 */
export async function primeiroAcesso(dados: z.output<typeof primeiroAcessoSchema>) {
  const senhaHash = await hashSenha(dados.senha);

  return prisma.$transaction(async (tx) => {
    // Trava a tabela contra dois "primeiro acesso" simultâneos.
    await tx.$executeRaw`LOCK TABLE usuarios IN EXCLUSIVE MODE`;
    if ((await tx.usuario.count()) > 0) {
      throw conflito('O sistema já foi configurado. Entre com o seu usuário.', COD.JA_CONFIGURADO);
    }
    await tx.oficina.upsert({
      where: { id: 'unica' },
      update: { nome: dados.oficinaNome },
      create: { id: 'unica', nome: dados.oficinaNome },
    });
    return tx.usuario.create({
      data: { nome: dados.nome, email: dados.email, senhaHash, perfil: 'DONO', ultimoAcesso: new Date() },
    });
  });
}
