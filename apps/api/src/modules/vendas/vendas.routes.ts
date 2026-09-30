import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { cancelarVendaSchema, idParams, listarVendasQuery, vendaSchema } from '@hermes/shared/schemas';
import { exigir } from '../../plugins/autenticacao.js';
import * as service from './vendas.service.js';

const tags = ['Venda de balcão'];

export const vendasRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', exigir('atender'));

  app.get('/', { schema: { tags, querystring: listarVendasQuery } }, (req) => service.listar(req.query));
  app.get('/:id', { schema: { tags, params: idParams } }, (req) => service.buscar(req.params.id));

  app.post('/', { onRequest: exigir('receberPagamentos'), schema: { tags, body: vendaSchema } }, async (req, reply) =>
    reply.code(201).send(await service.criar(req.body, req.usuario)),
  );

  // Desfazer venda mexe no caixa: só o Dono.
  app.post(
    '/:id/cancelar',
    { onRequest: exigir('apagarRegistros'), schema: { tags, params: idParams, body: cancelarVendaSchema } },
    (req) => service.cancelar(req.params.id, req.body.motivo, req.usuario),
  );
};
