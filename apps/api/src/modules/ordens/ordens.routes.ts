import type { FastifyInstance } from 'fastify';
import type { StatusOS } from '@prisma/client';
import { authenticate } from '../../lib/auth.js';
import { mudarStatusSchema, atribuirMecanicoSchema, receberSchema } from './ordens.schema.js';
import * as service from './ordens.service.js';

export async function ordensRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /ordens?busca=&status= — lista/filtra as OS
  app.get('/', async (req) => {
    const q = req.query as { busca?: string; status?: StatusOS };
    return service.listOrdens(q.busca, q.status);
  });

  // GET /ordens/:id — detalhe com itens, cliente, veículo e mecânico
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const os = await service.getOrdem(id);
    if (!os) return reply.code(404).send({ message: 'Ordem de Serviço não encontrada' });
    return os;
  });

  // PATCH /ordens/:id/status — avança o fluxo (iniciar/concluir/entregar/cancelar)
  app.patch('/:id/status', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = mudarStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    return service.mudarStatus(id, parsed.data.status);
  });

  // PATCH /ordens/:id/mecanico — atribui o mecânico responsável
  app.patch('/:id/mecanico', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = atribuirMecanicoSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    return service.atribuirMecanico(id, parsed.data.mecanicoId);
  });

  // POST /ordens/:id/receber — recebe o pagamento (RN-11). Mecânico não recebe.
  app.post('/:id/receber', async (req, reply) => {
    if (req.user.perfil === 'MECANICO') {
      return reply.code(403).send({ message: 'Seu perfil não pode receber pagamentos' });
    }
    const { id } = req.params as { id: string };
    const parsed = receberSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    return service.receberPagamento(id, parsed.data, req.user.sub);
  });
}
