import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { lancamentoSchema, listarCaixaQuery, resumoDiaQuery } from '@hermes/shared/schemas';
import { exigir } from '../../plugins/autenticacao.js';
import * as service from './caixa.service.js';

const tags = ['Livro-caixa'];

export const caixaRoutes: FastifyPluginAsyncZod = async (app) => {
  // Financeiro é do Dono.
  app.addHook('onRequest', exigir('verFinanceiro'));

  // GET /api/caixa?de=&ate=&tipo=&origem=&pagina= — lançamentos + totais do período
  app.get('/', { schema: { tags, querystring: listarCaixaQuery } }, (req) => service.listar(req.query));

  // GET /api/caixa/resumo?data=AAAA-MM-DD — fechamento do dia (RN-15)
  app.get('/resumo', { schema: { tags, querystring: resumoDiaQuery } }, (req) => service.resumoDia(req.query.data));

  // POST /api/caixa — lançamento manual (aporte, retirada, venda avulsa, despesa miúda)
  app.post('/', { schema: { tags, body: lancamentoSchema } }, async (req, reply) =>
    reply.code(201).send(await service.criar(req.body, req.usuario)),
  );
};
