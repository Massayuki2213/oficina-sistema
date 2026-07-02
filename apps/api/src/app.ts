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
import { orcamentosRoutes } from './modules/orcamentos/orcamentos.routes.js';
import { ordensRoutes } from './modules/ordens/ordens.routes.js';
import { AppError } from './lib/errors.js';

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
  app.register(orcamentosRoutes, { prefix: '/orcamentos' });
  app.register(ordensRoutes, { prefix: '/ordens' });

  // Tratador global: converte AppError (regra de negócio) na resposta certa.
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ message: error.message });
    }
    req.log.error(error);
    const code = typeof error.statusCode === 'number' ? error.statusCode : 500;
    return reply.code(code).send({ message: code >= 500 ? 'Erro interno no servidor' : error.message });
  });

  // TODO: financeiro — próximos módulos:
  // app.register(caixaRoutes, { prefix: '/caixa' });      // livro-caixa (RN-11, RN-15)
  // app.register(despesasRoutes, { prefix: '/despesas' }); // RN-12
  // app.register(contasRoutes, { prefix: '/contas-receber' }); // RN-11.1/11.2
  // app.register(ordensRoutes, { prefix: '/ordens' });
  // app.register(estoqueRoutes, { prefix: '/estoque' });
  // app.register(caixaRoutes, { prefix: '/caixa' });

  // Expõe prisma/redis no request se precisar depois
  app.decorate('prisma', prisma);
  app.decorate('redis', redis);

  return app;
}
