import type { FastifyInstance } from 'fastify';
import { authenticate, requirePermission } from '../../lib/auth.js';
import { lancamentoSchema } from './caixa.schema.js';
import * as service from './caixa.service.js';

export async function caixaRoutes(app: FastifyInstance) {
  // Financeiro é restrito: só quem pode ver o financeiro (Dono) acessa o caixa.
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', requirePermission('verFinanceiro'));

  // GET /caixa?de=YYYY-MM-DD&ate=YYYY-MM-DD — lançamentos do período + totais
  app.get('/', async (req) => {
    const { de, ate } = req.query as { de?: string; ate?: string };
    return service.listCaixa(de, ate);
  });

  // GET /caixa/resumo?data=YYYY-MM-DD — fechamento do dia (RN-15)
  app.get('/resumo', async (req) => {
    const { data } = req.query as { data?: string };
    return service.resumoDia(data);
  });

  // POST /caixa — lançamento manual (aporte, sangria, venda avulsa)
  app.post('/', async (req, reply) => {
    const parsed = lancamentoSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    const lancamento = await service.criarLancamento(parsed.data, req.user.sub);
    return reply.code(201).send(lancamento);
  });
}
