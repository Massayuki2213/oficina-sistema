import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { idParams, lancarFiadoSchema, listarContasQuery, receberParcelaSchema } from '@hermes/shared/schemas';
import { exigir } from '../../plugins/autenticacao.js';
import * as service from './contas.service.js';

const tags = ['Contas a receber'];

export const contasRoutes: FastifyPluginAsyncZod = async (app) => {
  // Receber é do balcão (Atendente e Dono). O mecânico não mexe com dinheiro.
  app.addHook('onRequest', exigir('receberPagamentos'));

  // GET /api/contas-receber?clienteId=&status=&atrasadas=true&pagina=
  app.get('/', { schema: { tags, querystring: listarContasQuery } }, (req) => service.listar(req.query));

  // GET /api/contas-receber/resumo — quem deve, quanto e quem está em atraso (RN-11.2)
  app.get('/resumo', { schema: { tags } }, () => service.resumo());

  // POST /api/contas-receber — fiado lançado à mão (o caderno, na implantação)
  app.post('/', { schema: { tags, body: lancarFiadoSchema }, config: { acao: 'LANCAR_FIADO' } }, async (req, reply) =>
    reply.code(201).send(await service.lancarFiado(req.body)),
  );

  // POST /api/contas-receber/:id/receber — baixa (total ou parcial) → entra no caixa
  app.post('/:id/receber', { schema: { tags, params: idParams, body: receberParcelaSchema } }, (req) =>
    service.receber(req.params.id, req.body, req.usuario),
  );

  // POST /api/contas-receber/:id/cancelar — perdão/calote: só o Dono.
  app.post('/:id/cancelar', { onRequest: exigir('apagarRegistros'), schema: { tags, params: idParams } }, (req) =>
    service.cancelar(req.params.id),
  );
};
