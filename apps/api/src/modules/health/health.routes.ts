import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';

export async function healthRoutes(app: FastifyInstance) {
  // Verifica se API, banco e cache estão de pé.
  app.get('/health', async () => {
    const [db, cache] = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      redis.ping(),
    ]);

    return {
      status: 'ok',
      service: 'hermes-api',
      database: db.status === 'fulfilled' ? 'up' : 'down',
      cache: cache.status === 'fulfilled' ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    };
  });
}
