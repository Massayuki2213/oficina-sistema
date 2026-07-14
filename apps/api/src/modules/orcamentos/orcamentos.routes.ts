import type { FastifyInstance } from 'fastify';
import { pode } from '@hermes/shared';
import { authenticate, requirePermission } from '../../lib/auth.js';
import { createOrcamentoSchema, statusOrcamentoSchema, aprovarSchema } from './orcamentos.schema.js';
import * as service from './orcamentos.service.js';

export async function orcamentosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /orcamentos?busca= — lista por cliente ou placa
  app.get('/', async (req) => service.listOrcamentos((req.query as { busca?: string }).busca));

  // GET /orcamentos/:id — detalhe com itens, cliente e veículo
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const orc = await service.getOrcamento(id);
    if (!orc) return reply.code(404).send({ message: 'Orçamento não encontrado' });
    return orc;
  });

  // POST /orcamentos — cria o orçamento com serviços e peças
  app.post('/', async (req, reply) => {
    const parsed = createOrcamentoSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    // RN-08: dar desconto exige permissão (Mecânico não pode).
    if (parsed.data.desconto > 0 && !pode(req.user.perfil, 'darDesconto')) {
      return reply.code(403).send({ message: 'Seu perfil não pode aplicar desconto' });
    }
    const orcamento = await service.createOrcamento(parsed.data);
    return reply.code(201).send(orcamento);
  });

  // PUT /orcamentos/:id — corrige o orçamento (enquanto não virou OS)
  app.put('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = createOrcamentoSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    // RN-08: dar desconto exige permissão (Mecânico não pode).
    if (parsed.data.desconto > 0 && !pode(req.user.perfil, 'darDesconto')) {
      return reply.code(403).send({ message: 'Seu perfil não pode aplicar desconto' });
    }
    return service.updateOrcamento(id, parsed.data);
  });

  // DELETE /orcamentos/:id — apaga o orçamento. Só quem pode apagar registros (Dono).
  app.delete('/:id', { preHandler: [requirePermission('apagarRegistros')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await service.deleteOrcamento(id);
    return reply.code(204).send();
  });

  // PATCH /orcamentos/:id/status — enviar / recusar / marcar rascunho
  app.patch('/:id/status', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = statusOrcamentoSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    return service.alterarStatus(id, parsed.data.status);
  });

  // POST /orcamentos/:id/aprovar — RN-07: aprova e gera a OS em 1 clique
  app.post('/:id/aprovar', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = aprovarSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    const resultado = await service.aprovarParaOS(id, parsed.data.mecanicoId);
    return reply.code(201).send(resultado);
  });
}
