import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { idParams, listarServicosQuery, servicoSchema } from '@hermes/shared/schemas';
import { exigir } from '../../plugins/autenticacao.js';
import * as service from './servicos.service.js';

const tags = ['Serviços'];

export const servicosRoutes: FastifyPluginAsyncZod = async (app) => {
  // Leitura: todo perfil (o mecânico vê o catálogo ao apontar serviço).
  app.get('/', { schema: { tags, querystring: listarServicosQuery } }, (req) => service.listar(req.query));
  app.get('/:id', { schema: { tags, params: idParams } }, (req) => service.buscar(req.params.id));

  // Preço de mão de obra é decisão do balcão/Dono, não do mecânico.
  app.post('/', { onRequest: exigir('atender'), schema: { tags, body: servicoSchema } }, async (req, reply) =>
    reply.code(201).send(await service.criar(req.body)),
  );
  app.put('/:id', { onRequest: exigir('atender'), schema: { tags, params: idParams, body: servicoSchema } }, (req) =>
    service.atualizar(req.params.id, req.body),
  );
  app.delete('/:id', { onRequest: exigir('apagarRegistros'), schema: { tags, params: idParams } }, async (req, reply) => {
    await service.inativar(req.params.id);
    return reply.code(204).send();
  });
};
