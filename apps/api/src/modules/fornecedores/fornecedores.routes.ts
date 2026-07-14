import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { authenticate, requirePermission } from '../../lib/auth.js';
import { createFornecedorSchema, updateFornecedorSchema } from './fornecedores.schema.js';
import * as service from './fornecedores.service.js';

function isNotFound(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}

export async function fornecedoresRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /fornecedores — lista com o total devido (compras pendentes) por distribuidor
  app.get('/', async () => service.listFornecedores());

  // GET /fornecedores/:id
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const forn = await service.getFornecedor(id);
    if (!forn) return reply.code(404).send({ message: 'Distribuidor não encontrado' });
    return forn;
  });

  // Cadastrar/editar mexe no cadastro de custo/compra: exige alterarPrecoCusto (Dono).
  app.post('/', { preHandler: [requirePermission('alterarPrecoCusto')] }, async (req, reply) => {
    const parsed = createFornecedorSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    return reply.code(201).send(await service.createFornecedor(parsed.data));
  });

  app.put('/:id', { preHandler: [requirePermission('alterarPrecoCusto')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateFornecedorSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    try {
      return await service.updateFornecedor(id, parsed.data);
    } catch (err) {
      if (isNotFound(err)) return reply.code(404).send({ message: 'Distribuidor não encontrado' });
      throw err;
    }
  });

  // DELETE — exclusão definitiva, restrita a quem pode apagar (Dono).
  app.delete('/:id', { preHandler: [requirePermission('apagarRegistros')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await service.deleteFornecedor(id);
    return reply.code(204).send();
  });
}
