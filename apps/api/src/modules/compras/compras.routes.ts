import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { compraSchema, idParams, listarComprasQuery, pagarCompraSchema } from '@hermes/shared/schemas';
import { exigir, exigirAlguma } from '../../plugins/autenticacao.js';
import * as service from './compras.service.js';

const tags = ['Compras'];

export const comprasRoutes: FastifyPluginAsyncZod = async (app) => {
  // Compra define custo de estoque e gera dívida: assunto do Dono.
  app.addHook('onRequest', exigirAlguma('alterarPrecoCusto', 'verFinanceiro'));
  const financeiro = { onRequest: exigir('verFinanceiro') };

  app.get('/', { schema: { tags, querystring: listarComprasQuery } }, (req) => service.listar(req.query));

  // GET /api/compras/a-pagar — quanto devo a cada distribuidor
  app.get('/a-pagar', { ...financeiro, schema: { tags } }, () => service.contasAPagar());

  app.get('/:id', { schema: { tags, params: idParams } }, (req) => service.buscar(req.params.id));

  // POST /api/compras — registra a compra e dá entrada no estoque.
  app.post('/', { onRequest: exigir('alterarPrecoCusto'), schema: { tags, body: compraSchema } }, async (req, reply) =>
    reply.code(201).send(await service.criar(req.body, req.usuario)),
  );

  // POST /api/compras/:id/pagar — quita uma compra (sai do caixa).
  app.post('/:id/pagar', { ...financeiro, schema: { tags, params: idParams, body: pagarCompraSchema } }, (req) =>
    service.pagar(req.params.id, req.body, req.usuario),
  );

  // POST /api/compras/acerto/:fornecedorId — quita tudo do distribuidor de uma vez.
  app.post(
    '/acerto/:fornecedorId',
    { ...financeiro, schema: { tags, params: z.object({ fornecedorId: z.string().min(1) }), body: pagarCompraSchema } },
    (req) => service.quitarFornecedor(req.params.fornecedorId, req.body, req.usuario),
  );

  // DELETE /api/compras/:id — apaga compra a prazo (estorna o estoque).
  app.delete('/:id', { onRequest: exigir('apagarRegistros'), schema: { tags, params: idParams } }, async (req, reply) => {
    await service.excluir(req.params.id, req.usuario);
    return reply.code(204).send();
  });
};
