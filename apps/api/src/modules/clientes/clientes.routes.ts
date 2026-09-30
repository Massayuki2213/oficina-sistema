import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { clienteSchema, idParams, listarClientesQuery } from '@hermes/shared/schemas';
import { exigir } from '../../plugins/autenticacao.js';
import * as service from './clientes.service.js';

const tags = ['Clientes'];

export const clientesRoutes: FastifyPluginAsyncZod = async (app) => {
  // Cadastro de cliente é do balcão. O mecânico vê o nome do cliente na OS,
  // mas não precisa (nem deve, pela LGPD) navegar pelos contatos de todos.
  app.addHook('onRequest', exigir('cadastrarClientes'));

  // GET /api/clientes?busca=&pagina= — nome, CPF, telefone ou placa
  app.get('/', { schema: { tags, querystring: listarClientesQuery } }, (req) => service.listar(req.query));

  // GET /api/clientes/:id — ficha: veículos, OS, fiado
  app.get('/:id', { schema: { tags, params: idParams } }, (req) => service.ficha(req.params.id));

  app.post('/', { schema: { tags, body: clienteSchema } }, async (req, reply) =>
    reply.code(201).send(await service.criar(req.body)),
  );

  app.put('/:id', { schema: { tags, params: idParams, body: clienteSchema } }, (req) =>
    service.atualizar(req.params.id, req.body),
  );

  // DELETE /api/clientes/:id — inativa (o histórico fica). Só o Dono.
  app.delete('/:id', { onRequest: exigir('apagarRegistros'), schema: { tags, params: idParams } }, async (req, reply) => {
    await service.inativar(req.params.id);
    return reply.code(204).send();
  });

  // POST /api/clientes/:id/anonimizar — LGPD: apaga os dados pessoais. Só o Dono.
  app.post(
    '/:id/anonimizar',
    { onRequest: exigir('apagarRegistros'), schema: { tags, params: idParams } },
    async (req, reply) => {
      await service.anonimizar(req.params.id);
      return reply.code(204).send();
    },
  );
};
