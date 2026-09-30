import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  ativoSchema,
  atualizarUsuarioSchema,
  criarUsuarioSchema,
  equipeQuery,
  idParams,
  redefinirSenhaSchema,
  trocarSenhaSchema,
} from '@hermes/shared/schemas';
import { exigir, iniciarSessao } from '../../plugins/autenticacao.js';
import * as service from './usuarios.service.js';

const tags = ['Usuários'];

export const usuariosRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /api/usuarios/equipe?perfil=MECANICO — quem está ativo (para escolher o mecânico).
  app.get('/equipe', { schema: { tags, querystring: equipeQuery } }, (req) => service.equipe(req.query.perfil));

  // PATCH /api/usuarios/minha-senha — qualquer perfil troca a própria senha.
  app.patch('/minha-senha', { schema: { tags, body: trocarSenhaSchema } }, async (req, reply) => {
    const u = await service.trocarPropriaSenha(req.usuario.id, req.body.senhaAtual, req.body.novaSenha);
    // As outras sessões caíram; esta continua com um cookie novo.
    await iniciarSessao(req, reply, u);
    return reply.code(204).send();
  });

  // Daqui para baixo: só o Dono administra usuários.
  const soDono = { onRequest: exigir('gerenciarUsuarios') };

  app.get('/', { ...soDono, schema: { tags } }, () => service.listar());

  app.post('/', { ...soDono, schema: { tags, body: criarUsuarioSchema } }, async (req, reply) =>
    reply.code(201).send(await service.criar(req.body)),
  );

  app.put('/:id', { ...soDono, schema: { tags, params: idParams, body: atualizarUsuarioSchema } }, (req) =>
    service.atualizar(req.params.id, req.body, req.usuario.id),
  );

  app.patch('/:id/senha', { ...soDono, schema: { tags, params: idParams, body: redefinirSenhaSchema } }, async (req, reply) => {
    await service.redefinirSenha(req.params.id, req.body.senha);
    return reply.code(204).send();
  });

  app.patch('/:id/ativo', { ...soDono, schema: { tags, params: idParams, body: ativoSchema } }, (req) =>
    service.definirAtivo(req.params.id, req.body.ativo, req.usuario.id),
  );

  // POST /api/usuarios/:id/encerrar-sessoes — derruba os aparelhos da pessoa (celular perdido).
  app.post('/:id/encerrar-sessoes', { ...soDono, schema: { tags, params: idParams } }, (req) =>
    service.encerrarSessoes(req.params.id),
  );
};
