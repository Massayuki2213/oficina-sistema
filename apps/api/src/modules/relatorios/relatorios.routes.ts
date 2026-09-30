import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { evolucaoQuery, periodoQuery } from '@hermes/shared/schemas';
import { exigir } from '../../plugins/autenticacao.js';
import * as service from './relatorios.service.js';

const tags = ['Relatórios'];

export const relatoriosRoutes: FastifyPluginAsyncZod = async (app) => {
  // Relatórios de lucro são o financeiro do dono.
  app.addHook('onRequest', exigir('verFinanceiro'));

  app.get('/resumo', { schema: { tags, querystring: periodoQuery } }, (req) => service.resumo(req.query));
  app.get('/evolucao', { schema: { tags, querystring: evolucaoQuery } }, (req) => service.evolucao(req.query.meses));
  app.get('/rankings', { schema: { tags, querystring: periodoQuery } }, (req) => service.rankings(req.query));
  app.get('/por-categoria', { schema: { tags, querystring: periodoQuery } }, (req) => service.porCategoria(req.query));
  app.get('/produtividade', { schema: { tags, querystring: periodoQuery } }, (req) => service.produtividade(req.query));
  app.get('/estoque', { schema: { tags } }, () => service.estoque());
};
