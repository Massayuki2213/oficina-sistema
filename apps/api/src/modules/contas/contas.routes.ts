import type { FastifyInstance } from 'fastify';
import type { StatusParcela } from '@prisma/client';
import { authenticate } from '../../lib/auth.js';
import { receberParcelaSchema } from './contas.schema.js';
import * as service from './contas.service.js';

export async function contasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);
  // Contas a receber é de balcão (Atendente/Dono). Mecânico não tem acesso.
  app.addHook('preHandler', async (req, reply) => {
    if (req.user.perfil === 'MECANICO') {
      return reply.code(403).send({ message: 'Seu perfil não acessa contas a receber' });
    }
  });

  // GET /contas-receber?clienteId=&status=&atrasadas=true — parcelas + totais
  app.get('/', async (req) => {
    const q = req.query as { clienteId?: string; status?: StatusParcela; atrasadas?: string };
    return service.listContas({ clienteId: q.clienteId, status: q.status, atrasadas: q.atrasadas === 'true' });
  });

  // GET /contas-receber/resumo — quem deve, quanto e quem está em atraso (RN-11.2)
  app.get('/resumo', async () => service.resumoPorCliente());

  // PATCH /contas-receber/:id/receber — dá baixa na parcela → entra no caixa (RN-11.1)
  app.patch('/:id/receber', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = receberParcelaSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    return service.receberParcela(id, parsed.data, req.user.sub);
  });
}
