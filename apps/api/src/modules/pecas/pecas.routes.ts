import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ajusteEstoqueSchema,
  criarPecaSchema,
  entradaEstoqueSchema,
  idParams,
  listarPecasQuery,
  movimentosQuery,
  pecaSchema,
} from '@hermes/shared/schemas';
import { exigir } from '../../plugins/autenticacao.js';
import * as service from './pecas.service.js';

const tags = ['Peças e estoque'];

export const pecasRoutes: FastifyPluginAsyncZod = async (app) => {
  // Leitura: todo perfil (o custo só aparece para quem pode ver).
  app.get('/', { schema: { tags, querystring: listarPecasQuery } }, (req) => service.listar(req.query, req.usuario));

  // GET /api/pecas/codigo/:codigo — o "bip" do leitor. 404 = peça nova.
  app.get('/codigo/:codigo', { schema: { tags, params: z.object({ codigo: z.string().min(1) }) } }, (req) =>
    service.buscarPorCodigo(req.params.codigo, req.usuario),
  );

  app.get('/:id', { schema: { tags, params: idParams } }, (req) => service.buscar(req.params.id, req.usuario));

  app.get('/:id/movimentos', { schema: { tags, params: idParams, querystring: movimentosQuery } }, (req) =>
    service.movimentos(req.params.id, req.query, req.usuario),
  );

  // Cadastro mexe em custo → Dono.
  app.post('/', { onRequest: exigir('alterarPrecoCusto'), schema: { tags, body: criarPecaSchema } }, async (req, reply) =>
    reply.code(201).send(await service.criar(req.body, req.usuario)),
  );
  app.put('/:id', { onRequest: exigir('alterarPrecoCusto'), schema: { tags, params: idParams, body: pecaSchema } }, (req) =>
    service.atualizar(req.params.id, req.body, req.usuario),
  );
  app.delete('/:id', { onRequest: exigir('apagarRegistros'), schema: { tags, params: idParams } }, async (req, reply) => {
    await service.inativar(req.params.id);
    return reply.code(204).send();
  });

  // POST /api/pecas/:id/entrada — reposição (leitor de código de barras, nota recebida).
  app.post(
    '/:id/entrada',
    { onRequest: exigir('movimentarEstoque'), schema: { tags, params: idParams, body: entradaEstoqueSchema } },
    (req) => service.entrada(req.params.id, req.body, req.usuario),
  );

  // POST /api/pecas/:id/ajuste — inventário: saldo passa a ser o contado.
  app.post(
    '/:id/ajuste',
    { onRequest: exigir('ajustarEstoque'), schema: { tags, params: idParams, body: ajusteEstoqueSchema } },
    (req) => service.ajuste(req.params.id, req.body, req.usuario),
  );
};
