import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { authenticate } from '../../lib/auth.js';
import { createCarroSchema, updateCarroSchema } from './carros.schema.js';
import * as service from './carros.service.js';

function isNotFound(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}
function isDuplicate(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
// Falha de chave estrangeira: clienteId aponta para um cliente que não existe.
function isBadCliente(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003';
}

export async function carrosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /carros?busca=texto — lista/busca por placa, marca, modelo ou dono
  app.get('/', async (req) => service.listCarros((req.query as { busca?: string }).busca));

  // GET /carros/placa/:placa — RN-16: acha o carro pela placa e traz o histórico.
  // 404 sinaliza para o front abrir o cadastro do veículo.
  app.get('/placa/:placa', async (req, reply) => {
    const { placa } = req.params as { placa: string };
    const carro = await service.buscarPorPlaca(placa);
    if (!carro) return reply.code(404).send({ message: 'Veículo não encontrado', placa });
    return carro;
  });

  // GET /carros/:id — detalhe com dono e histórico completo
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const carro = await service.getCarro(id);
    if (!carro) return reply.code(404).send({ message: 'Veículo não encontrado' });
    return carro;
  });

  // POST /carros — cadastro (vinculado a um cliente)
  app.post('/', async (req, reply) => {
    const parsed = createCarroSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    try {
      const carro = await service.createCarro(parsed.data);
      return reply.code(201).send(carro);
    } catch (err) {
      if (isDuplicate(err)) return reply.code(409).send({ message: 'Já existe um veículo com essa placa' });
      if (isBadCliente(err)) return reply.code(400).send({ message: 'Cliente informado não existe' });
      throw err;
    }
  });

  // PUT /carros/:id — edição
  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateCarroSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    try {
      return await service.updateCarro(id, parsed.data);
    } catch (err) {
      if (isNotFound(err)) return reply.code(404).send({ message: 'Veículo não encontrado' });
      if (isDuplicate(err)) return reply.code(409).send({ message: 'Já existe um veículo com essa placa' });
      throw err;
    }
  });
}
