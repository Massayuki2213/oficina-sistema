import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  abrirGarantiaSchema,
  adicionarPecaOSSchema,
  adicionarServicoOSSchema,
  alterarPecaOSSchema,
  alterarServicoOSSchema,
  atribuirMecanicoSchema,
  atualizarOSSchema,
  cancelarOSSchema,
  criarOSSchema,
  estornarPagamentoSchema,
  idParams,
  itemParams,
  listarOSQuery,
  mudarStatusOSSchema,
  receberOSSchema,
} from '@hermes/shared/schemas';
import { exigir } from '../../plugins/autenticacao.js';
import * as service from './ordens.service.js';

const tags = ['Ordens de Serviço'];

export const ordensRoutes: FastifyPluginAsyncZod = async (app) => {
  // Todo perfil entra aqui; o que cada um vê e faz é decidido no service
  // (o mecânico enxerga só as OS dele e as sem mecânico).
  const balcao = { onRequest: exigir('atender') };

  app.get('/', { schema: { tags, querystring: listarOSQuery } }, (req) => service.listar(req.query, req.usuario));

  app.get('/:id', { schema: { tags, params: idParams } }, (req) => service.buscar(req.params.id, req.usuario));

  // POST /api/ordens — OS direta, sem orçamento.
  app.post('/', { ...balcao, schema: { tags, body: criarOSSchema } }, async (req, reply) =>
    reply.code(201).send(await service.criar(req.body, req.usuario)),
  );

  // PATCH /api/ordens/:id — KM, queixa, laudo, previsão, desconto.
  app.patch('/:id', { schema: { tags, params: idParams, body: atualizarOSSchema } }, (req) =>
    service.atualizar(req.params.id, req.body, req.usuario),
  );

  // ---- Itens ----
  app.post(
    '/:id/servicos',
    { ...balcao, schema: { tags, params: idParams, body: adicionarServicoOSSchema }, config: { acao: 'ADICIONAR_SERVICO' } },
    (req) => service.adicionarServico(req.params.id, req.body, req.usuario),
  );
  app.patch(
    '/:id/servicos/:itemId',
    { schema: { tags, params: itemParams, body: alterarServicoOSSchema }, config: { acao: 'ALTERAR_SERVICO' } },
    (req) => service.alterarServico(req.params.id, req.params.itemId, req.body, req.usuario),
  );
  app.delete(
    '/:id/servicos/:itemId',
    { ...balcao, schema: { tags, params: itemParams }, config: { acao: 'REMOVER_SERVICO' } },
    (req) => service.removerServico(req.params.id, req.params.itemId, req.usuario),
  );
  app.post(
    '/:id/pecas',
    { schema: { tags, params: idParams, body: adicionarPecaOSSchema }, config: { acao: 'ADICIONAR_PECA' } },
    (req) => service.adicionarPeca(req.params.id, req.body, req.usuario),
  );
  app.patch(
    '/:id/pecas/:itemId',
    { schema: { tags, params: itemParams, body: alterarPecaOSSchema }, config: { acao: 'ALTERAR_PECA' } },
    (req) => service.alterarPeca(req.params.id, req.params.itemId, req.body, req.usuario),
  );
  app.delete(
    '/:id/pecas/:itemId',
    { schema: { tags, params: itemParams }, config: { acao: 'REMOVER_PECA' } },
    (req) => service.removerPeca(req.params.id, req.params.itemId, req.usuario),
  );

  // ---- Fluxo ----
  app.patch('/:id/status', { schema: { tags, params: idParams, body: mudarStatusOSSchema } }, (req) =>
    service.mudarStatus(req.params.id, req.body.status, req.usuario),
  );
  app.patch('/:id/mecanico', { ...balcao, schema: { tags, params: idParams, body: atribuirMecanicoSchema } }, (req) =>
    service.atribuirMecanico(req.params.id, req.body.mecanicoId, req.usuario),
  );
  // POST /api/ordens/:id/assumir — o mecânico pega uma OS sem ninguém.
  app.post('/:id/assumir', { schema: { tags, params: idParams } }, (req) => service.assumir(req.params.id, req.usuario));

  app.post('/:id/cancelar', { ...balcao, schema: { tags, params: idParams, body: cancelarOSSchema } }, (req) =>
    service.cancelar(req.params.id, req.body.motivo, req.usuario),
  );

  // ---- Dinheiro ----
  // POST /api/ordens/:id/receber — RN-11: à vista, parcelado, fiado ou misto.
  app.post(
    '/:id/receber',
    { onRequest: exigir('receberPagamentos'), schema: { tags, params: idParams, body: receberOSSchema } },
    (req) => service.receber(req.params.id, req.body, req.usuario),
  );
  // POST /api/ordens/:id/estornar-pagamento — só o Dono desfaz dinheiro.
  app.post(
    '/:id/estornar-pagamento',
    { onRequest: exigir('apagarRegistros'), schema: { tags, params: idParams, body: estornarPagamentoSchema } },
    (req) => service.estornarPagamento(req.params.id, req.body.motivo, req.usuario),
  );

  // ---- Garantia (RN-18) ----
  app.get('/:id/garantia', { schema: { tags, params: idParams } }, (req) =>
    service.situacaoGarantia(req.params.id, req.usuario),
  );
  app.post('/:id/garantia', { ...balcao, schema: { tags, params: idParams, body: abrirGarantiaSchema } }, async (req, reply) =>
    reply.code(201).send(await service.abrirGarantia(req.params.id, req.body, req.usuario)),
  );
};
