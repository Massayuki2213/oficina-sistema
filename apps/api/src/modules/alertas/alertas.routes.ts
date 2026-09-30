import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { exigir } from '../../plugins/autenticacao.js';
import * as service from './alertas.service.js';

const tags = ['Alertas'];

export const alertasRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /api/alertas — o painel do dia (cada perfil recebe o que pode resolver)
  app.get('/', { schema: { tags } }, (req) => service.todos(req.usuario));

  // GET /api/alertas/revisao-vencida?meses=6 — RN-20, a lista completa de retornos
  app.get(
    '/revisao-vencida',
    { onRequest: exigir('atender'), schema: { tags, querystring: z.object({ meses: z.coerce.number().int().min(1).max(60).default(6) }) } },
    (req) => service.revisaoVencida(req.query.meses),
  );
};
