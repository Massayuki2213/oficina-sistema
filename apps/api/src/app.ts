import Fastify, { type RouteOptions } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { env } from './lib/env.js';
import { plugarAuditoria } from './lib/auditoria.js';
import autenticacao, { exigirSessao } from './plugins/autenticacao.js';
import { registrarSeguranca } from './plugins/seguranca.js';
import { registrarTratamentoDeErros } from './plugins/erros.js';
import { registrarDocumentacao } from './plugins/documentacao.js';
import { registrarIdempotencia } from './plugins/idempotencia.js';
import { registrarInterfaceWeb } from './plugins/interface-web.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { usuariosRoutes } from './modules/usuarios/usuarios.routes.js';
import { oficinaRoutes } from './modules/oficina/oficina.routes.js';
import { clientesRoutes } from './modules/clientes/clientes.routes.js';
import { carrosRoutes } from './modules/carros/carros.routes.js';
import { servicosRoutes } from './modules/servicos/servicos.routes.js';
import { pecasRoutes } from './modules/pecas/pecas.routes.js';
import { fornecedoresRoutes } from './modules/fornecedores/fornecedores.routes.js';
import { orcamentosRoutes } from './modules/orcamentos/orcamentos.routes.js';
import { ordensRoutes } from './modules/ordens/ordens.routes.js';
import { vendasRoutes } from './modules/vendas/vendas.routes.js';
import { agendaRoutes } from './modules/agenda/agenda.routes.js';
import { caixaRoutes } from './modules/caixa/caixa.routes.js';
import { despesasRoutes } from './modules/despesas/despesas.routes.js';
import { contasRoutes } from './modules/contas/contas.routes.js';
import { comprasRoutes } from './modules/compras/compras.routes.js';
import { alertasRoutes } from './modules/alertas/alertas.routes.js';
import { relatoriosRoutes } from './modules/relatorios/relatorios.routes.js';
import { auditoriaRoutes } from './modules/auditoria/auditoria.routes.js';
import { backupRoutes } from './modules/backup/backup.routes.js';

// ============================================================
// Monta o servidor: plugins de base, as rotas da API sob /api e,
// por último, a interface (a tela) servida na raiz.
// ============================================================

export interface OpcoesApp {
  /** Observa cada rota registrada (o teste de "negar por padrão" varre todas). */
  aoRegistrarRota?: (rota: RouteOptions) => void;
}

export async function buildApp(opcoes: OpcoesApp = {}) {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : 'info'),
      // Token e cookie nunca vão para o log.
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
          : undefined,
    },
    trustProxy: env.TRUST_PROXY,
    // O logo da oficina vai em base64 no corpo: 1 MB dá folga.
    bodyLimit: 1_048_576,
  }).withTypeProvider<ZodTypeProvider>();

  if (opcoes.aoRegistrarRota) app.addHook('onRoute', opcoes.aoRegistrarRota);

  // Validação e serialização pelos schemas Zod de @hermes/shared.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Corpo JSON vazio vira {} — ações sem payload (ex.: /assumir) chegam com
  // Content-Type: application/json e corpo vazio. O resto passa pelo parser
  // padrão do Fastify, que barra "prototype poisoning" (__proto__ no JSON).
  const jsonPadrao = app.getDefaultJsonParser('error', 'ignore');
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, corpo, feito) => {
    const texto = corpo as string;
    if (texto.trim() === '') return feito(null, {});
    jsonPadrao(req, texto, feito);
  });

  await registrarSeguranca(app);
  await app.register(autenticacao);
  registrarTratamentoDeErros(app);
  // Auditoria antes das rotas, para observar todas elas.
  plugarAuditoria(app);
  // Idempotência dos POST (ADR 0011): repetição devolve a resposta guardada.
  registrarIdempotencia(app);
  if (env.docs) await registrarDocumentacao(app);

  await app.register(
    async (api) => {
      // Negar por padrão: toda rota daqui para baixo exige sessão, a não ser
      // que se declare pública. Roda antes dos `exigir(...)` de cada módulo.
      api.addHook('onRequest', exigirSessao);

      await api.register(healthRoutes);
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(usuariosRoutes, { prefix: '/usuarios' });
      await api.register(oficinaRoutes, { prefix: '/oficina' });
      await api.register(clientesRoutes, { prefix: '/clientes' });
      await api.register(carrosRoutes, { prefix: '/carros' });
      await api.register(servicosRoutes, { prefix: '/servicos' });
      await api.register(pecasRoutes, { prefix: '/pecas' });
      await api.register(fornecedoresRoutes, { prefix: '/fornecedores' });
      await api.register(orcamentosRoutes, { prefix: '/orcamentos' });
      await api.register(ordensRoutes, { prefix: '/ordens' });
      await api.register(vendasRoutes, { prefix: '/vendas' });
      await api.register(agendaRoutes, { prefix: '/agenda' });
      await api.register(caixaRoutes, { prefix: '/caixa' });
      await api.register(despesasRoutes, { prefix: '/despesas' });
      await api.register(contasRoutes, { prefix: '/contas-receber' });
      await api.register(comprasRoutes, { prefix: '/compras' });
      await api.register(alertasRoutes, { prefix: '/alertas' });
      await api.register(relatoriosRoutes, { prefix: '/relatorios' });
      await api.register(auditoriaRoutes, { prefix: '/auditoria' });
      await api.register(backupRoutes, { prefix: '/backup' });
    },
    { prefix: '/api' },
  );

  await registrarInterfaceWeb(app);
  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
