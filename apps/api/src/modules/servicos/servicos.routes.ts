import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { authenticate, requirePermission } from '../../lib/auth.js';
import { createServicoSchema, updateServicoSchema } from './servicos.schema.js';
import * as service from './servicos.service.js';

function isNotFound(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}

export async function servicosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /servicos?busca=texto — catálogo (nome ou categoria)
  app.get('/', async (req) => service.listServicos((req.query as { busca?: string }).busca));

  // GET /servicos/:id
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const servico = await service.getServico(id);
    if (!servico) return reply.code(404).send({ message: 'Serviço não encontrado' });
    return servico;
  });

  // POST /servicos — cadastro no catálogo
  app.post('/', async (req, reply) => {
    const parsed = createServicoSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    const servico = await service.createServico(parsed.data);
    return reply.code(201).send(servico);
  });

  // PUT /servicos/:id
  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateServicoSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    try {
      return await service.updateServico(id, parsed.data);
    } catch (err) {
      if (isNotFound(err)) return reply.code(404).send({ message: 'Serviço não encontrado' });
      throw err;
    }
  });

  // DELETE /servicos/:id — inativa (soft delete). Restrito a quem pode apagar (Dono).
  app.delete('/:id', { preHandler: [requirePermission('apagarRegistros')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await service.deactivateServico(id);
      return reply.code(204).send();
    } catch (err) {
      if (isNotFound(err)) return reply.code(404).send({ message: 'Serviço não encontrado' });
      throw err;
    }
  });
}
