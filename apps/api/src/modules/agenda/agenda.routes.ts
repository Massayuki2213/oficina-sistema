import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { atualizarVisitaSchema, idParams, listarAgendaQuery, statusVisitaSchema, visitaSchema } from '@hermes/shared/schemas';
import { exigir } from '../../plugins/autenticacao.js';
import * as service from './agenda.service.js';

const tags = ['Agenda'];

export const agendaRoutes: FastifyPluginAsyncZod = async (app) => {
  const balcao = { onRequest: exigir('atender') };

  // Todo perfil vê a agenda (o mecânico se organiza por ela); marcar é do balcão.
  app.get('/', { schema: { tags, querystring: listarAgendaQuery } }, (req) => service.listar(req.query));

  app.post('/', { ...balcao, schema: { tags, body: visitaSchema } }, async (req, reply) =>
    reply.code(201).send(await service.criar(req.body)),
  );
  app.put('/:id', { ...balcao, schema: { tags, params: idParams, body: atualizarVisitaSchema } }, (req) =>
    service.atualizar(req.params.id, req.body),
  );
  app.patch('/:id/status', { ...balcao, schema: { tags, params: idParams, body: statusVisitaSchema } }, (req) =>
    service.alterarStatus(req.params.id, req.body.status),
  );
  app.delete('/:id', { ...balcao, schema: { tags, params: idParams } }, async (req, reply) => {
    await service.excluir(req.params.id);
    return reply.code(204).send();
  });
};
