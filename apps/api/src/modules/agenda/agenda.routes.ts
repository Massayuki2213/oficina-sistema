import type { FastifyInstance } from 'fastify';
import type { StatusVisita } from '@prisma/client';
import { authenticate } from '../../lib/auth.js';
import { createVisitaSchema, statusVisitaSchema, updateVisitaSchema } from './agenda.schema.js';
import * as service from './agenda.service.js';

export async function agendaRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /agenda?de=YYYY-MM-DD&ate=YYYY-MM-DD&status= — agendamentos do período
  app.get('/', async (req) => {
    const { de, ate, status } = req.query as { de?: string; ate?: string; status?: StatusVisita };
    return service.listVisitas(de, ate, status);
  });

  // POST /agenda — cria o agendamento (visita)
  app.post('/', async (req, reply) => {
    const parsed = createVisitaSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    const visita = await service.createVisita(parsed.data);
    return reply.code(201).send(visita);
  });

  // PATCH /agenda/:id/status — confirmar / marcar realizada / faltou
  app.patch('/:id/status', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = statusVisitaSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    return service.alterarStatus(id, parsed.data.status);
  });

  // PUT /agenda/:id — remarcar / editar (data, tipo, veículo, observações)
  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateVisitaSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    return service.updateVisita(id, parsed.data);
  });

  // DELETE /agenda/:id — cancela/remove o agendamento
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await service.deleteVisita(id);
    return reply.code(204).send();
  });
}
