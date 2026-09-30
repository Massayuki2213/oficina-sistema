import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { exigir } from '../../plugins/autenticacao.js';
import * as service from './backup.service.js';

const tags = ['Backup'];

export const backupRoutes: FastifyPluginAsyncZod = async (app) => {
  // O backup é a cópia de tudo: só o Dono vê, gera e baixa.
  app.addHook('onRequest', exigir('gerenciarBackup'));

  // GET /api/backup — situação atual (último backup, se está atrasado, lista recente)
  app.get('/', { schema: { tags } }, () => service.statusBackup());

  // POST /api/backup — gera uma cópia agora ("Fazer backup agora")
  app.post('/', { schema: { tags } }, async (req, reply) => {
    const feito = await service.gerarBackup();
    req.log.info(`Backup manual gerado por ${req.usuario.nome}: ${feito.arquivo}`);
    return reply.code(201).send(feito);
  });

  // GET /api/backup/:arquivo — baixa a cópia (para guardar fora do PC da oficina)
  app.get(
    '/:arquivo',
    { schema: { tags, params: z.object({ arquivo: z.string().min(1) }) } },
    async (req, reply) => {
      const { stream, bytes } = await service.abrirArquivo(req.params.arquivo);
      return reply
        .header('Content-Type', req.params.arquivo.endsWith('.enc') ? 'application/octet-stream' : 'application/sql; charset=utf-8')
        .header('Content-Length', bytes)
        .header('Content-Disposition', `attachment; filename="${req.params.arquivo}"`)
        .send(stream);
    },
  );
};
