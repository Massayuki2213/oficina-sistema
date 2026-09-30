import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { VERSAO, type SaudeDTO } from '@hermes/shared';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../lib/env.js';

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /api/health — a API e o banco estão de pé? Usado pelo Docker, pelo
  // app desktop (antes de abrir a janela) e por quem monitora o servidor.
  app.get('/health', { schema: { tags: ['Sistema'] }, config: { publica: true } }, async (_req, reply) => {
    const banco = await prisma.$queryRaw`SELECT 1`.then(
      () => 'up' as const,
      () => 'down' as const,
    );
    const corpo: SaudeDTO = {
      status: banco === 'up' ? 'ok' : 'degradado',
      versao: VERSAO,
      banco,
      horario: new Date().toISOString(),
      fuso: env.TZ,
    };
    return reply.code(banco === 'up' ? 200 : 503).send(corpo);
  });
};
