import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { fornecedorSchema, idParams } from '@hermes/shared/schemas';
import { exigir, exigirAlguma } from '../../plugins/autenticacao.js';
import * as service from './fornecedores.service.js';

const tags = ['Distribuidores'];

export const fornecedoresRoutes: FastifyPluginAsyncZod = async (app) => {
  // Distribuidor é assunto de compra e custo — e mostra quanto a oficina deve.
  app.addHook('onRequest', exigirAlguma('alterarPrecoCusto', 'verFinanceiro'));

  app.get('/', { schema: { tags } }, () => service.listar());
  app.get('/:id', { schema: { tags, params: idParams } }, (req) => service.buscar(req.params.id));

  app.post('/', { onRequest: exigir('alterarPrecoCusto'), schema: { tags, body: fornecedorSchema } }, async (req, reply) =>
    reply.code(201).send(await service.criar(req.body)),
  );
  app.put(
    '/:id',
    { onRequest: exigir('alterarPrecoCusto'), schema: { tags, params: idParams, body: fornecedorSchema } },
    (req) => service.atualizar(req.params.id, req.body),
  );
  app.delete('/:id', { onRequest: exigir('apagarRegistros'), schema: { tags, params: idParams } }, async (req, reply) => {
    await service.excluir(req.params.id);
    return reply.code(204).send();
  });
};
