import { createHmac, randomBytes } from 'node:crypto';
import type { Perfil } from '@hermes/shared';
import { prisma } from './prisma.js';
import { env } from './env.js';

// ============================================================
// Sessão opaca guardada no banco (ADR 0009).
//
// O cookie leva 32 bytes aleatórios; o banco guarda só o HMAC deles
// (com SESSAO_SEGREDO). Validar = achar a linha pelo hash. Encerrar =
// apagar a linha — vale na hora, sem esperar nada vencer.
//
// Duas validades, como pede a OWASP:
//  - inatividade (SESSAO_DURACAO, 12h): usar o sistema empurra para frente;
//  - limite absoluto (7 dias desde o login): depois disso, entra de novo.
// ============================================================

/** Mesmo com uso contínuo, a sessão não passa disto desde o login. */
export const LIMITE_ABSOLUTO_MS = 7 * 24 * 60 * 60 * 1000;
/** Renovar a cada requisição seria uma escrita por clique; de 5 em 5 minutos basta. */
const RENOVAR_APOS_MS = 5 * 60 * 1000;

const hashDoToken = (token: string) => createHmac('sha256', env.SESSAO_SEGREDO).update(token).digest('hex');

function validaAte(criadaEm: Date, agora: Date) {
  return new Date(Math.min(agora.getTime() + env.sessaoDuracaoMs, criadaEm.getTime() + LIMITE_ABSOLUTO_MS));
}

/**
 * "Edge no Windows", "App Hermes no Windows", "Chrome no Android" — para a
 * pessoa reconhecer o aparelho na lista. Não é identificação: é só um rótulo.
 */
export function descreverAparelho(ua?: string | null): string | null {
  if (!ua) return null;
  const app = /Electron\/|hermes-janela/i.test(ua)
    ? 'App Hermes'
    : /Edg(A|iOS)?\//.test(ua)
      ? 'Edge'
      : /OPR\//.test(ua)
        ? 'Opera'
        : /Firefox\/|FxiOS/.test(ua)
          ? 'Firefox'
          : /SamsungBrowser/.test(ua)
            ? 'Samsung Internet'
            : /Chrome\/|CriOS/.test(ua)
              ? 'Chrome'
              : /Safari\//.test(ua)
                ? 'Safari'
                : 'Navegador';
  // A ordem importa: iPhone também diz "Mac OS X"; Android também diz "Linux".
  const sistema = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(ua)
        ? 'iPhone/iPad'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'Mac'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  return sistema ? `${app} no ${sistema}` : app;
}

/** Login: cria a sessão e devolve o token (que só o cookie vai conhecer). */
export async function abrirSessao(usuarioId: string, origem: { ip?: string; userAgent?: string }) {
  const token = randomBytes(32).toString('base64url');
  const agora = new Date();
  const sessao = await prisma.sessao.create({
    data: {
      tokenHash: hashDoToken(token),
      usuarioId,
      criadaEm: agora,
      ultimoUso: agora,
      expiraEm: validaAte(agora, agora),
      ip: origem.ip ?? null,
      aparelho: descreverAparelho(origem.userAgent),
    },
  });
  // Faxina barata: as sessões vencidas (de todo mundo) saem a cada login.
  await prisma.sessao.deleteMany({ where: { expiraEm: { lt: agora } } });
  return { token, sessao };
}

export type ResultadoSessao =
  | { ok: true; sessaoId: string; usuario: { id: string; nome: string; email: string; perfil: Perfil } }
  | { ok: false; motivo: 'encerrada' | 'expirada' };

/** Confere o token de uma requisição. Renova a validade com o uso. */
export async function validarToken(token: string): Promise<ResultadoSessao> {
  const agora = new Date();
  const s = await prisma.sessao.findUnique({
    where: { tokenHash: hashDoToken(token) },
    include: { usuario: { select: { id: true, nome: true, email: true, perfil: true, ativo: true } } },
  });
  // Sem linha = alguém encerrou (logout, troca de senha, o Dono) — ou o token é inventado.
  if (!s || !s.usuario.ativo) return { ok: false, motivo: 'encerrada' };
  if (s.expiraEm <= agora) return { ok: false, motivo: 'expirada' };

  if (agora.getTime() - s.ultimoUso.getTime() > RENOVAR_APOS_MS) {
    // updateMany: se a sessão foi encerrada neste meio-tempo, não há o que renovar.
    await prisma.sessao.updateMany({ where: { id: s.id }, data: { ultimoUso: agora, expiraEm: validaAte(s.criadaEm, agora) } });
  }
  const { id, nome, email, perfil } = s.usuario;
  return { ok: true, sessaoId: s.id, usuario: { id, nome, email, perfil } };
}

/** Logout: apaga a sessão deste token. */
export async function encerrarPorToken(token: string) {
  await prisma.sessao.deleteMany({ where: { tokenHash: hashDoToken(token) } });
}

/**
 * Derruba as sessões de uma pessoa — troca de senha, acesso cortado, celular
 * perdido. `exceto`: a sessão de quem está pedindo continua de pé.
 */
export async function encerrarDoUsuario(usuarioId: string, exceto?: string | null): Promise<number> {
  const r = await prisma.sessao.deleteMany({ where: { usuarioId, ...(exceto ? { id: { not: exceto } } : {}) } });
  return r.count;
}

/** Encerra UMA sessão — só se for da própria pessoa (ninguém derruba a de outro por aqui). */
export async function encerrarUma(usuarioId: string, sessaoId: string): Promise<boolean> {
  const r = await prisma.sessao.deleteMany({ where: { id: sessaoId, usuarioId } });
  return r.count > 0;
}

/** As sessões em aberto de uma pessoa, da usada mais recentemente para a mais antiga. */
export function listarDoUsuario(usuarioId: string) {
  return prisma.sessao.findMany({ where: { usuarioId, expiraEm: { gt: new Date() } }, orderBy: { ultimoUso: 'desc' } });
}

/** Quantas sessões em aberto cada pessoa tem (tela de Equipe). */
export async function contarPorUsuario(): Promise<Map<string, number>> {
  const linhas = await prisma.sessao.groupBy({ by: ['usuarioId'], where: { expiraEm: { gt: new Date() } }, _count: { _all: true } });
  return new Map(linhas.map((l) => [l.usuarioId, l._count._all]));
}
