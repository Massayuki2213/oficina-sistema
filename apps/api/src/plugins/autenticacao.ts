import fp from 'fastify-plugin';
import cookie from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { PERMISSOES, type Perfil, type Permissao, type UsuarioSessao } from '@hermes/shared';
import { env } from '../lib/env.js';
import { AppError, COD, semPermissao } from '../lib/errors.js';
import { LIMITE_ABSOLUTO_MS, abrirSessao, encerrarPorToken, validarToken } from '../lib/sessoes.js';

// ============================================================
// Sessão: um token opaco num cookie httpOnly, conferido no banco
// a cada requisição (ADR 0009).
//
//  - httpOnly: o JavaScript da página não lê o token — um script
//    malicioso não consegue roubá-lo (o localStorage deixaria).
//  - SameSite=Strict: o navegador não manda o cookie em requisição
//    vinda de outro site (proteção contra CSRF).
//  - O token não carrega nada: é só a chave da linha em `sessoes`.
//    Perfil e "ativo" são lidos do banco; logout, troca de senha e
//    "encerrar sessões" apagam a linha e valem NA HORA.
//
// O header "Authorization: Bearer <token>" continua aceito, para integrações.
// ============================================================

export const COOKIE_SESSAO = 'hermes_sessao';

declare module 'fastify' {
  interface FastifyRequest {
    /** Preenchido por `app.autenticar`. */
    usuario: UsuarioSessao;
    /** A sessão desta requisição (para "esta é a sua" e "encerrar as outras"). */
    sessaoId: string | null;
  }
  interface FastifyInstance {
    autenticar: (req: FastifyRequest) => Promise<void>;
  }
  interface FastifyContextConfig {
    /** true: a rota da API atende sem sessão. Sem isto, exige sessão (ver `exigirSessao`). */
    publica?: boolean;
  }
}

export function paraSessao(u: { id: string; nome: string; email: string; perfil: Perfil }): UsuarioSessao {
  return { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, permissoes: PERMISSOES[u.perfil] };
}

/** Cookie seguro (só HTTPS) quando configurado — ou, no 'auto', quando a conexão é HTTPS. */
function cookieSeguro(req: FastifyRequest) {
  return env.COOKIE_SECURE === 'true' || (env.COOKIE_SECURE === 'auto' && req.protocol === 'https');
}

const opcoesCookie = (req: FastifyRequest) => ({
  path: '/',
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: cookieSeguro(req),
});

/** O token da requisição: o cookie da tela, ou o Bearer de uma integração. */
function tokenDa(req: FastifyRequest): string | null {
  const doCookie = req.cookies[COOKIE_SESSAO];
  if (doCookie) return doCookie;
  const auth = req.headers.authorization;
  return auth?.startsWith('Bearer ') ? auth.slice(7).trim() || null : null;
}

/** Abre a sessão e grava o cookie. O cookie dura o limite absoluto; quem decide antes disso é o banco. */
export async function iniciarSessao(req: FastifyRequest, reply: FastifyReply, u: { id: string }) {
  const { token, sessao } = await abrirSessao(u.id, { ip: req.ip, userAgent: req.headers['user-agent'] });
  req.sessaoId = sessao.id;
  reply.setCookie(COOKIE_SESSAO, token, { ...opcoesCookie(req), maxAge: LIMITE_ABSOLUTO_MS / 1000 });
}

/** Apaga o cookie de sessão do navegador (a linha no banco é com quem chama). */
export function limparCookieSessao(req: FastifyRequest, reply: FastifyReply) {
  reply.clearCookie(COOKIE_SESSAO, opcoesCookie(req));
}

/** Logout: apaga a sessão no banco (o token deixa de valer) e o cookie. */
export async function encerrarSessao(req: FastifyRequest, reply: FastifyReply) {
  const token = tokenDa(req);
  if (token) await encerrarPorToken(token);
  limparCookieSessao(req, reply);
}

const naoAutenticado = (mensagem: string) => new AppError(401, mensagem, COD.NAO_AUTENTICADO);

export default fp(
  async (app) => {
    await app.register(cookie);

    app.decorateRequest('usuario', null as unknown as UsuarioSessao);
    app.decorateRequest('sessaoId', null);

    app.decorate('autenticar', async (req: FastifyRequest) => {
      const token = tokenDa(req);
      if (!token) throw naoAutenticado('Entre no sistema para continuar.');

      const r = await validarToken(token);
      if (!r.ok) {
        throw naoAutenticado(
          r.motivo === 'expirada'
            ? 'Sua sessão expirou por falta de uso. Entre de novo.'
            : 'Sua sessão foi encerrada. Entre de novo.',
        );
      }
      req.usuario = paraSessao(r.usuario);
      req.sessaoId = r.sessaoId;
    });
  },
  { name: 'autenticacao' },
);

/**
 * Negar por padrão — o onRequest de todo o escopo /api.
 *
 * Toda rota da API exige sessão, inclusive as de um módulo que ainda vai
 * ser escrito: esquecer uma linha não abre nada. A exceção se declara na
 * própria rota, à vista de quem revisa: `config: { publica: true }`.
 * Os módulos só dizem QUEM pode (`exigir`), nunca SE precisa entrar.
 */
export async function exigirSessao(req: FastifyRequest) {
  if (req.routeOptions.config?.publica) return;
  await req.server.autenticar(req);
}

/** preHandler: exige TODAS as permissões informadas. */
export const exigir =
  (...permissoes: Permissao[]) =>
  async (req: FastifyRequest) => {
    if (!permissoes.every((p) => req.usuario?.permissoes[p])) throw semPermissao();
  };

/** preHandler: exige AO MENOS UMA das permissões informadas. */
export const exigirAlguma =
  (...permissoes: Permissao[]) =>
  async (req: FastifyRequest) => {
    if (!permissoes.some((p) => req.usuario?.permissoes[p])) throw semPermissao();
  };
