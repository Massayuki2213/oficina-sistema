import type { FastifyInstance } from 'fastify';
import { authenticate, requirePermission } from '../../lib/auth.js';
import * as service from './backup.service.js';

export async function backupRoutes(app: FastifyInstance) {
  // O backup é a cópia de tudo: só o Dono vê e gera.
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', requirePermission('gerenciarBackup'));

  // GET /backup — situação atual (último backup, se está atrasado, lista recente)
  app.get('/', async () => service.statusBackup());

  // POST /backup — gera uma cópia agora ("Fazer backup agora")
  app.post('/', async (req, reply) => {
    const feito = await service.gerarBackup();
    req.log.info(`Backup manual gerado por ${req.user.nome}: ${feito.arquivo}`);
    return reply.code(201).send(feito);
  });
}
