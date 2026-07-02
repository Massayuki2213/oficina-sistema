import type { FastifyInstance } from 'fastify';
import { authenticate, requirePermission } from '../../lib/auth.js';
import * as service from './relatorios.service.js';

export async function relatoriosRoutes(app: FastifyInstance) {
  // Relatórios de lucro são o financeiro do dono: só quem vê o financeiro.
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', requirePermission('verFinanceiro'));

  // GET /relatorios/resumo?de=&ate= — faturamento × lucro real (RN-13/14)
  app.get('/resumo', async (req) => {
    const { de, ate } = req.query as { de?: string; ate?: string };
    return service.resumoFinanceiro(de, ate);
  });

  // GET /relatorios/rankings?de=&ate= — serviços/peças/clientes que mais giram (seção 10)
  app.get('/rankings', async (req) => {
    const { de, ate } = req.query as { de?: string; ate?: string };
    return service.rankings(de, ate);
  });

  // GET /relatorios/por-categoria?de=&ate= — para onde vai / de onde vem o dinheiro
  app.get('/por-categoria', async (req) => {
    const { de, ate } = req.query as { de?: string; ate?: string };
    return service.porCategoria(de, ate);
  });
}
