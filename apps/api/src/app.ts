import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { redis } from './config/redis.js';
import { healthRoutes } from './routes/health.js';

export function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'development' ? 'info' : 'warn',
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
          : undefined,
    },
  });

  app.register(cors, { origin: true });
  app.register(jwt, { secret: env.JWT_SECRET, sign: { expiresIn: env.JWT_EXPIRES_IN } });

  // Rotas
  app.register(healthRoutes);

  // TODO: registrar os módulos (regras de negócio RN-01 a RN-21):
  // app.register(clientesRoutes, { prefix: '/clientes' });
  // app.register(orcamentosRoutes, { prefix: '/orcamentos' });
  // app.register(ordensRoutes, { prefix: '/ordens' });
  // app.register(estoqueRoutes, { prefix: '/estoque' });
  // app.register(caixaRoutes, { prefix: '/caixa' });

  // Expõe prisma/redis no request se precisar depois
  app.decorate('prisma', prisma);
  app.decorate('redis', redis);

  return app;
}
