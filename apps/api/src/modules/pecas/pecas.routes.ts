import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { authenticate, requirePermission } from '../../lib/auth.js';
import { createPecaSchema, updatePecaSchema, entradaEstoqueSchema } from './pecas.schema.js';
import * as service from './pecas.service.js';

function isDuplicate(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export async function pecasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /pecas?busca=texto — lista/busca (nome, SKU ou código de barras)
  app.get('/', async (req) => service.listPecas((req.query as { busca?: string }).busca));

  // GET /pecas/codigo/:codigo — o "scan": acha a peça pelo código de barras lido.
  // 404 sinaliza para o front abrir o cadastro de peça nova.
  app.get('/codigo/:codigo', async (req, reply) => {
    const { codigo } = req.params as { codigo: string };
    const peca = await service.buscarPorCodigo(codigo);
    if (!peca) return reply.code(404).send({ message: 'Peça não encontrada', codigoBarras: codigo });
    return peca;
  });

  // POST /pecas — cadastro. Mexe em preço de custo → restrito (Dono).
  app.post('/', { preHandler: [requirePermission('alterarPrecoCusto')] }, async (req, reply) => {
    const parsed = createPecaSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    try {
      const peca = await service.createPeca(parsed.data);
      return reply.code(201).send(peca);
    } catch (err) {
      if (isDuplicate(err)) {
        return reply.code(409).send({ message: 'Já existe peça com esse código de barras ou SKU' });
      }
      throw err;
    }
  });

  // PUT /pecas/:id — edição. Também restrito (mexe em custo/margem).
  app.put('/:id', { preHandler: [requirePermission('alterarPrecoCusto')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updatePecaSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    try {
      const peca = await service.updatePeca(id, parsed.data);
      if (!peca) return reply.code(404).send({ message: 'Peça não encontrada' });
      return peca;
    } catch (err) {
      if (isDuplicate(err)) {
        return reply.code(409).send({ message: 'Já existe peça com esse código de barras ou SKU' });
      }
      throw err;
    }
  });

  // POST /pecas/:id/estoque — entrada de estoque (recebimento / leitura no balcão).
  app.post('/:id/estoque', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = entradaEstoqueSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    const peca = await service.entradaEstoque(id, parsed.data);
    if (!peca) return reply.code(404).send({ message: 'Peça não encontrada' });
    return peca;
  });
}
