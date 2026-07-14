import type { FastifyInstance } from 'fastify';
import { authenticate, requirePermission } from '../../lib/auth.js';
import { createCompraSchema } from './compras.schema.js';
import * as service from './compras.service.js';

export async function comprasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /compras?de=&ate=&fornecedorId=&status= — lista com totais
  app.get('/', async (req) => {
    const q = req.query as { de?: string; ate?: string; fornecedorId?: string; status?: 'PENDENTE' | 'PAGA' };
    return service.listCompras(q);
  });

  // GET /compras/a-pagar — quanto devo a cada distribuidor (antes de /:id!)
  app.get('/a-pagar', { preHandler: [requirePermission('verFinanceiro')] }, async () => service.contasAPagar());

  // GET /compras/:id — detalhe com itens
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const compra = await service.getCompra(id);
    if (!compra) return reply.code(404).send({ message: 'Compra não encontrada' });
    return compra;
  });

  // POST /compras — registra a compra e dá entrada no estoque.
  // Define custo de peças/estoque: exige alterarPrecoCusto (Dono).
  app.post('/', { preHandler: [requirePermission('alterarPrecoCusto')] }, async (req, reply) => {
    const parsed = createCompraSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    return reply.code(201).send(await service.createCompra(parsed.data, req.user.sub));
  });

  // PATCH /compras/:id/pagar — quita uma compra (sai do caixa). Financeiro.
  app.patch('/:id/pagar', { preHandler: [requirePermission('verFinanceiro')] }, async (req) => {
    const { id } = req.params as { id: string };
    return service.pagarCompra(id, req.user.sub);
  });

  // POST /compras/acerto/:fornecedorId — quita tudo do distribuidor de uma vez.
  app.post('/acerto/:fornecedorId', { preHandler: [requirePermission('verFinanceiro')] }, async (req) => {
    const { fornecedorId } = req.params as { fornecedorId: string };
    return service.quitarFornecedor(fornecedorId, req.user.sub);
  });

  // DELETE /compras/:id — apaga compra a prazo (estorna estoque). Só quem pode apagar.
  app.delete('/:id', { preHandler: [requirePermission('apagarRegistros')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await service.deleteCompra(id);
    return reply.code(204).send();
  });
}
