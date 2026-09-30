import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { listarAuditoriaQuery } from '@hermes/shared/schemas';
import { exigir } from '../../plugins/autenticacao.js';
import * as service from './auditoria.service.js';

const tags = ['Auditoria'];

export const auditoriaRoutes: FastifyPluginAsyncZod = async (app) => {
  // Histórico de quem fez o quê é assunto do Dono.
  app.addHook('onRequest', exigir('verAuditoria'));

  // GET /api/auditoria?entidade=&usuarioId=&de=&ate=&pagina=
  app.get('/', { schema: { tags, querystring: listarAuditoriaQuery } }, (req) => service.listar(req.query));

  // GET /api/auditoria/entidades — o que já foi registrado (para o filtro da tela)
  app.get('/entidades', { schema: { tags } }, () => service.entidades());
};
