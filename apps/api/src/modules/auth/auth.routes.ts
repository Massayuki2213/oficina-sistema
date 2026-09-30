import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { SessaoDTO } from '@hermes/shared';
import { idParams, loginSchema, primeiroAcessoSchema } from '@hermes/shared/schemas';
import { registrarLogin } from '../../lib/auditoria.js';
import { AppError, COD, naoEncontrado } from '../../lib/errors.js';
import { encerrarDoUsuario, encerrarUma, listarDoUsuario } from '../../lib/sessoes.js';
import { emMinutos, limparFalhas, registrarFalha, segundosDeBloqueio } from '../../lib/tentativas.js';
import { encerrarSessao, iniciarSessao, limparCookieSessao, paraSessao } from '../../plugins/autenticacao.js';
import * as service from './auth.service.js';

const tags = ['Acesso'];
// As rotas de entrada são as únicas abertas sem sessão (o resto da API nega por padrão).
const publica = { publica: true };

function barrarSeBloqueado(ip: string, email: string) {
  const segundos = segundosDeBloqueio(ip, email);
  if (segundos) {
    throw new AppError(429, `Muitas tentativas erradas. Tente de novo em ${emMinutos(segundos)}.`, COD.MUITAS_TENTATIVAS);
  }
}

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /api/auth/situacao — público: nome/logo da oficina e se falta o primeiro acesso.
  app.get('/situacao', { schema: { tags }, config: publica }, () => service.situacao());

  // POST /api/auth/login — confere e-mail+senha e abre a sessão (cookie httpOnly).
  app.post('/login', { schema: { tags, body: loginSchema }, config: { ...publica, auditar: false } }, async (req, reply) => {
    const { email, senha } = req.body;
    barrarSeBloqueado(req.ip, email);

    const usuario = await service.validarCredenciais(email, senha);
    if (!usuario) {
      registrarFalha(req.ip, email);
      // Tentativa errada também vira log: senha errada em série é sinal de problema.
      await registrarLogin(null, email, false);
      throw new AppError(401, 'E-mail ou senha incorretos', COD.NAO_AUTENTICADO);
    }
    limparFalhas(req.ip, email);
    await registrarLogin(usuario.id, usuario.email, true);
    await iniciarSessao(req, reply, usuario);
    return { usuario: paraSessao(usuario) };
  });

  // POST /api/auth/primeiro-acesso — só com o banco vazio: cria o Dono e já entra.
  app.post(
    '/primeiro-acesso',
    { schema: { tags, body: primeiroAcessoSchema }, config: { ...publica, acao: 'PRIMEIRO_ACESSO' } },
    async (req, reply) => {
      barrarSeBloqueado(req.ip, 'primeiro-acesso');
      try {
        const dono = await service.primeiroAcesso(req.body);
        await iniciarSessao(req, reply, dono);
        req.usuario = paraSessao(dono); // para a auditoria saber quem foi
        return reply.code(201).send({ usuario: paraSessao(dono) });
      } catch (err) {
        registrarFalha(req.ip, 'primeiro-acesso');
        throw err;
      }
    },
  );

  // POST /api/auth/logout — encerra a sessão no banco e apaga o cookie.
  // Pública: quem está com a sessão vencida também consegue "sair".
  app.post('/logout', { schema: { tags }, config: { ...publica, auditar: false } }, async (req, reply) => {
    await encerrarSessao(req, reply);
    return reply.code(204).send();
  });

  // GET /api/auth/me — quem está logado (lido do banco, não do token).
  app.get('/me', { schema: { tags } }, (req) => req.usuario);

  // ---- Meus aparelhos (sessões abertas) ----

  // GET /api/auth/sessoes — onde estou logado agora.
  app.get('/sessoes', { schema: { tags } }, async (req): Promise<SessaoDTO[]> => {
    const sessoes = await listarDoUsuario(req.usuario.id);
    return sessoes.map((s) => ({
      id: s.id,
      aparelho: s.aparelho,
      ip: s.ip,
      criadaEm: s.criadaEm.toISOString(),
      ultimoUso: s.ultimoUso.toISOString(),
      atual: s.id === req.sessaoId,
    }));
  });

  // DELETE /api/auth/sessoes/:id — sai de um aparelho (só das próprias sessões).
  app.delete(
    '/sessoes/:id',
    { schema: { tags, params: idParams }, config: { acao: 'ENCERRAR_SESSAO' } },
    async (req, reply) => {
      if (!(await encerrarUma(req.usuario.id, req.params.id))) throw naoEncontrado('Sessão não encontrada');
      // Encerrou a sessão deste próprio aparelho: é um logout.
      if (req.params.id === req.sessaoId) limparCookieSessao(req, reply);
      return reply.code(204).send();
    },
  );

  // POST /api/auth/sessoes/encerrar-outras — "sair de todos os outros aparelhos".
  app.post('/sessoes/encerrar-outras', { schema: { tags }, config: { acao: 'ENCERRAR_OUTRAS_SESSOES' } }, async (req) => ({
    encerradas: await encerrarDoUsuario(req.usuario.id, req.sessaoId),
  }));
};
