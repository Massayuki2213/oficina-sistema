import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { criarDespesaSchema, despesaSchema, idParams, listarDespesasQuery, pagarDespesaSchema } from '@hermes/shared/schemas';
import { exigir } from '../../plugins/autenticacao.js';
import * as service from './despesas.service.js';

const tags = ['Despesas'];

export const despesasRoutes: FastifyPluginAsyncZod = async (app) => {
  // Despesas são financeiro: só quem vê o financeiro (Dono).
  app.addHook('onRequest', exigir('verFinanceiro'));

  app.get('/', { schema: { tags, querystring: listarDespesasQuery } }, (req) => service.listar(req.query));
  app.get('/categorias', { schema: { tags } }, () => service.categorias());
  app.get('/:id', { schema: { tags, params: idParams } }, (req) => service.buscar(req.params.id));

  // POST /api/despesas — cadastra (se já vier paga, a saída vai para o caixa)
  app.post('/', { schema: { tags, body: criarDespesaSchema } }, async (req, reply) =>
    reply.code(201).send(await service.criar(req.body, req.usuario)),
  );

  // POST /api/despesas/:id/pagar — RN-12: paga e lança a saída no caixa
  app.post('/:id/pagar', { schema: { tags, params: idParams, body: pagarDespesaSchema } }, (req) =>
    service.pagar(req.params.id, req.body, req.usuario),
  );

  // POST /api/despesas/:id/proximo-mes — conta fixa: lança a do mês seguinte
  app.post('/:id/proximo-mes', { schema: { tags, params: idParams } }, async (req, reply) =>
    reply.code(201).send(await service.repetirNoProximoMes(req.params.id)),
  );

  app.put('/:id', { schema: { tags, params: idParams, body: despesaSchema } }, (req) =>
    service.atualizar(req.params.id, req.body),
  );
  app.delete('/:id', { schema: { tags, params: idParams } }, async (req, reply) => {
    await service.excluir(req.params.id);
    return reply.code(204).send();
  });
};
