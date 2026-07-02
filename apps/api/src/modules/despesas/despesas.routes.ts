import type { FastifyInstance } from 'fastify';
import { authenticate, requirePermission } from '../../lib/auth.js';
import { createDespesaSchema, updateDespesaSchema } from './despesas.schema.js';
import * as service from './despesas.service.js';

export async function despesasRoutes(app: FastifyInstance) {
  // Despesas são financeiro: só o perfil que vê o financeiro (Dono) acessa.
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', requirePermission('verFinanceiro'));

  // GET /despesas?de=&ate=&categoria= — lista + totais (total, pago, a pagar)
  app.get('/', async (req) => {
    const { de, ate, categoria } = req.query as { de?: string; ate?: string; categoria?: string };
    return service.listDespesas(de, ate, categoria);
  });

  // GET /despesas/:id
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const despesa = await service.getDespesa(id);
    if (!despesa) return reply.code(404).send({ message: 'Despesa não encontrada' });
    return despesa;
  });

  // POST /despesas — cadastra (se já vier paga, lança a saída no caixa)
  app.post('/', async (req, reply) => {
    const parsed = createDespesaSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    const despesa = await service.createDespesa(parsed.data, req.user.sub);
    return reply.code(201).send(despesa);
  });

  // PATCH /despesas/:id/pagar — marca como paga e lança saída no caixa (RN-12)
  app.patch('/:id/pagar', async (req) => {
    const { id } = req.params as { id: string };
    return service.pagarDespesa(id, req.user.sub);
  });

  // PUT /despesas/:id — edição (não mexe em "pago")
  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateDespesaSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    return service.updateDespesa(id, parsed.data);
  });

  // DELETE /despesas/:id — só despesas ainda não pagas
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await service.deleteDespesa(id);
    return reply.code(204).send();
  });
}
