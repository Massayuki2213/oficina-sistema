import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../lib/auth.js';
import * as service from './alertas.service.js';

export async function alertasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /alertas — tudo que o painel do dia mostra
  app.get('/', async () => service.todosAlertas());

  // GET /alertas/revisao-vencida — RN-20, a lista de oportunidades de retorno
  app.get('/revisao-vencida', async (req) => {
    const { meses } = req.query as { meses?: string };
    return service.revisaoVencida(meses ? Number(meses) : undefined);
  });

  // GET /alertas/fiado/:clienteId — RN-11.2, situação do cliente antes de liberar fiado
  app.get('/fiado/:clienteId', async (req) => {
    const { clienteId } = req.params as { clienteId: string };
    return service.situacaoFiado(clienteId);
  });
}
