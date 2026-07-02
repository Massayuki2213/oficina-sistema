import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { env } from './lib/env.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { clientesRoutes } from './modules/clientes/clientes.routes.js';
import { carrosRoutes } from './modules/carros/carros.routes.js';
import { servicosRoutes } from './modules/servicos/servicos.routes.js';
import { pecasRoutes } from './modules/pecas/pecas.routes.js';

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
  app.register(authRoutes, { prefix: '/auth' });
  app.register(clientesRoutes, { prefix: '/clientes' });
  app.register(carrosRoutes, { prefix: '/carros' });
  app.register(servicosRoutes, { prefix: '/servicos' });
  app.register(pecasRoutes, { prefix: '/pecas' });

  // TODO: registrar os demais módulos (regras de negócio RN-01 a RN-21):
  // app.register(orcamentosRoutes, { prefix: '/orcamentos' });
  // app.register(ordensRoutes, { prefix: '/ordens' });
  // app.register(estoqueRoutes, { prefix: '/estoque' });
  // app.register(caixaRoutes, { prefix: '/caixa' });

  // Expõe prisma/redis no request se precisar depois
  app.decorate('prisma', prisma);
  app.decorate('redis', redis);

  return app;
}
