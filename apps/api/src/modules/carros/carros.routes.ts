import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { carroSchema, idParams, listarCarrosQuery } from '@hermes/shared/schemas';
import { exigir } from '../../plugins/autenticacao.js';
import * as service from './carros.service.js';

const tags = ['Veículos'];

export const carrosRoutes: FastifyPluginAsyncZod = async (app) => {
  const balcao = { onRequest: exigir('cadastrarClientes') };

  app.get('/', { ...balcao, schema: { tags, querystring: listarCarrosQuery } }, (req) => service.listar(req.query));

  // GET /api/carros/placa/:placa — RN-16: todo perfil consulta (o mecânico
  // também quer saber "já mexemos nisso?"). 404 = placa sem cadastro.
  app.get('/placa/:placa', { schema: { tags, params: z.object({ placa: z.string().min(1) }) } }, (req) =>
    service.fichaPorPlaca(req.params.placa, req.usuario),
  );

  app.get('/:id', { schema: { tags, params: idParams } }, (req) => service.ficha(req.params.id, req.usuario));

  app.post('/', { ...balcao, schema: { tags, body: carroSchema } }, async (req, reply) =>
    reply.code(201).send(await service.criar(req.body)),
  );

  app.put('/:id', { ...balcao, schema: { tags, params: idParams, body: carroSchema } }, (req) =>
    service.atualizar(req.params.id, req.body),
  );

  app.delete('/:id', { onRequest: exigir('apagarRegistros'), schema: { tags, params: idParams } }, async (req, reply) => {
    await service.inativar(req.params.id);
    return reply.code(204).send();
  });
};
