import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { oficinaSchema } from '@hermes/shared/schemas';
import { exigir } from '../../plugins/autenticacao.js';
import * as service from './oficina.service.js';
import { carregarCatalogoInicial } from '../../dominio/catalogo-inicial.js';
import { prisma } from '../../lib/prisma.js';

const tags = ['Oficina'];

export const oficinaRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET /api/oficina — todo perfil lê: o cabeçalho do documento impresso precisa disso.
  app.get('/', { schema: { tags } }, () => service.getOficina());

  // PUT /api/oficina — só o Dono muda os dados e as regras do negócio.
  app.put('/', { onRequest: exigir('configurarOficina'), schema: { tags, body: oficinaSchema } }, (req) =>
    service.updateOficina(req.body),
  );

  // POST /api/oficina/catalogo-inicial — serviços e peças comuns, sem preço, para
  // a oficina nova não cadastrar item por item. Só acrescenta o que falta.
  app.post('/catalogo-inicial', { onRequest: exigir('configurarOficina'), schema: { tags }, config: { acao: 'CATALOGO_INICIAL' } }, () =>
    carregarCatalogoInicial(prisma),
  );
};
