import type { FastifyInstance } from 'fastify';
import { authenticate, requirePermission } from '../../lib/auth.js';
import * as service from './auditoria.service.js';

export async function auditoriaRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);
  // Histórico de quem fez o quê é assunto do Dono.
  app.addHook('preHandler', requirePermission('verAuditoria'));

  // GET /auditoria?entidade=&usuarioId=&de=&ate=&limite=
  app.get('/', async (req) => {
    const q = req.query as service.FiltrosAuditoria & { limite?: string };
    return service.listLogs({ ...q, limite: q.limite ? Number(q.limite) : undefined });
  });

  // GET /auditoria/entidades — o que já foi registrado (para o filtro da tela)
  app.get('/entidades', async () => service.entidadesRegistradas());
}
