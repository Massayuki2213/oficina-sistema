import type { FastifyInstance } from 'fastify';
import { authenticate, requirePermission } from '../../lib/auth.js';
import { updateOficinaSchema } from './oficina.schema.js';
import * as service from './oficina.service.js';

export async function oficinaRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /oficina — todo perfil lê: o cabeçalho do documento impresso precisa disso.
  app.get('/', async () => service.getOficina());

  // PUT /oficina — só o Dono muda os dados do negócio.
  app.put('/', { preHandler: [requirePermission('gerenciarUsuarios')] }, async (req, reply) => {
    const parsed = updateOficinaSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    return service.updateOficina(parsed.data);
  });
}
