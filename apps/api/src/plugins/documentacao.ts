import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import { VERSAO } from '@hermes/shared';

// Documentação interativa da API (OpenAPI), gerada dos próprios schemas
// Zod das rotas — não tem como ficar desatualizada. Em /api/docs.
// Ligada por padrão só em desenvolvimento (API_DOCS=true liga em produção).

export async function registrarDocumentacao(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Hermes — API',
        description:
          'API do sistema de gestão da oficina. A sessão é um cookie httpOnly emitido em POST /api/auth/login ' +
          '(integrações podem mandar o mesmo token em "Authorization: Bearer").',
        version: VERSAO,
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });
}
