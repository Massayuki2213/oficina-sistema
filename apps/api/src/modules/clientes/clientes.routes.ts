import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { createClienteSchema, updateClienteSchema } from './clientes.schema.js';
import * as service from './clientes.service.js';

// Erro do Prisma para "registro não encontrado" no update/delete.
function isNotFound(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}

export async function clientesRoutes(app: FastifyInstance) {
  // GET /clientes?busca=texto  — lista/busca (RN-16: busca puxa o cliente)
  app.get('/', async (req) => {
    const { busca } = req.query as { busca?: string };
    return service.listClientes(busca);
  });

  // GET /clientes/:id — detalhe com veículos, histórico de OS e fiado
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const cliente = await service.getCliente(id);
    if (!cliente) return reply.code(404).send({ message: 'Cliente não encontrado' });
    return cliente;
  });

  // POST /clientes — cadastro
  app.post('/', async (req, reply) => {
    const parsed = createClienteSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    const cliente = await service.createCliente(parsed.data);
    return reply.code(201).send(cliente);
  });

  // PUT /clientes/:id — edição
  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateClienteSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    try {
      return await service.updateCliente(id, parsed.data);
    } catch (err) {
      if (isNotFound(err)) return reply.code(404).send({ message: 'Cliente não encontrado' });
      throw err;
    }
  });

  // DELETE /clientes/:id — inativa (soft delete). TODO: restringir ao perfil DONO no módulo auth.
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await service.deactivateCliente(id);
      return reply.code(204).send();
    } catch (err) {
      if (isNotFound(err)) return reply.code(404).send({ message: 'Cliente não encontrado' });
      throw err;
    }
  });
}
