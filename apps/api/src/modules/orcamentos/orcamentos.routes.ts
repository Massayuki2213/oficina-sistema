import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  aprovarOrcamentoSchema,
  identificarOrcamentoSchema,
  idParams,
  listarOrcamentosQuery,
  orcamentoSchema,
  statusOrcamentoSchema,
} from '@hermes/shared/schemas';
import { exigir } from '../../plugins/autenticacao.js';
import * as service from './orcamentos.service.js';

const tags = ['Orçamentos'];

export const orcamentosRoutes: FastifyPluginAsyncZod = async (app) => {
  // Orçamento é trabalho de balcão (PLANEJAMENTO, seção 2).
  app.addHook('onRequest', exigir('atender'));

  app.get('/', { schema: { tags, querystring: listarOrcamentosQuery } }, (req) => service.listar(req.query));

  app.get('/:id', { schema: { tags, params: idParams } }, (req) => service.buscar(req.params.id));

  app.post('/', { schema: { tags, body: orcamentoSchema } }, async (req, reply) =>
    reply.code(201).send(await service.criar(req.body, req.usuario)),
  );

  // PUT /api/orcamentos/:id — corrige enquanto não virou OS (renova a validade).
  app.put('/:id', { schema: { tags, params: idParams, body: orcamentoSchema } }, (req) =>
    service.atualizar(req.params.id, req.body, req.usuario),
  );

  app.delete('/:id', { onRequest: exigir('apagarRegistros'), schema: { tags, params: idParams } }, async (req, reply) => {
    await service.excluir(req.params.id);
    return reply.code(204).send();
  });

  // PATCH /api/orcamentos/:id/status — enviado / recusado / de volta a rascunho.
  app.patch('/:id/status', { schema: { tags, params: idParams, body: statusOrcamentoSchema } }, (req) =>
    service.alterarStatus(req.params.id, req.body.status),
  );

  // PATCH /api/orcamentos/:id/identificar — o orçamento rápido ganha cliente e veículo.
  app.patch('/:id/identificar', { schema: { tags, params: idParams, body: identificarOrcamentoSchema } }, (req) =>
    service.identificar(req.params.id, req.body.clienteId, req.body.carroId),
  );

  // POST /api/orcamentos/:id/duplicar — "refazer com os preços de hoje".
  app.post('/:id/duplicar', { schema: { tags, params: idParams } }, async (req, reply) =>
    reply.code(201).send(await service.duplicar(req.params.id, req.usuario)),
  );

  // POST /api/orcamentos/:id/aprovar — RN-07: aprova e gera a OS em 1 clique.
  app.post('/:id/aprovar', { schema: { tags, params: idParams, body: aprovarOrcamentoSchema } }, async (req, reply) =>
    reply.code(201).send(await service.aprovar(req.params.id, req.body, req.usuario)),
  );
};
