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
import { caixaRoutes } from './modules/caixa/caixa.routes.js';
import { despesasRoutes } from './modules/despesas/despesas.routes.js';
import { contasRoutes } from './modules/contas/contas.routes.js';
import { relatoriosRoutes } from './modules/relatorios/relatorios.routes.js';
import { agendaRoutes } from './modules/agenda/agenda.routes.js';
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

  // Aceita corpo JSON vazio como {} — ações sem payload (ex: /pagar, /aprovar,
  // /receber) chegam do front com Content-Type: application/json e body vazio.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const texto = (body as string).trim();
    if (texto.length === 0) return done(null, {});
    try {
      done(null, JSON.parse(texto));
    } catch (err) {
      (err as Error & { statusCode?: number }).statusCode = 400;
      done(err as Error, undefined);
    }
  });

  // Rotas
  app.register(healthRoutes);
  app.register(authRoutes, { prefix: '/auth' });
  app.register(clientesRoutes, { prefix: '/clientes' });
  app.register(carrosRoutes, { prefix: '/carros' });
  app.register(servicosRoutes, { prefix: '/servicos' });
  app.register(pecasRoutes, { prefix: '/pecas' });
  app.register(orcamentosRoutes, { prefix: '/orcamentos' });
  app.register(ordensRoutes, { prefix: '/ordens' });
  app.register(caixaRoutes, { prefix: '/caixa' });
  app.register(despesasRoutes, { prefix: '/despesas' });
  app.register(contasRoutes, { prefix: '/contas-receber' });
  app.register(relatoriosRoutes, { prefix: '/relatorios' });
  app.register(agendaRoutes, { prefix: '/agenda' });

  // Tratador global: converte AppError (regra de negócio) na resposta certa.
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ message: error.message });
    }
    req.log.error(error);
    const code = typeof error.statusCode === 'number' ? error.statusCode : 500;
    return reply.code(code).send({ message: code >= 500 ? 'Erro interno no servidor' : error.message });
  });

  // app.register(ordensRoutes, { prefix: '/ordens' });
  // app.register(estoqueRoutes, { prefix: '/estoque' });
  // app.register(caixaRoutes, { prefix: '/caixa' });

  // Expõe prisma/redis no request se precisar depois
  app.decorate('prisma', prisma);
  app.decorate('redis', redis);

  return app;
}
