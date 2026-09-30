import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// ============================================================
// Variáveis de ambiente, validadas na inicialização.
// Falha cedo e em português: melhor não subir do que subir errado.
// ============================================================

const booleano = (padrao: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(padrao)
    .transform((v) => v === 'true');

/** O valor que vem no .env.example. Em produção, recusa: é público no repositório. */
const SEGREDO_DE_EXEMPLO = 'troque-por-uma-chave-longa-e-secreta';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),

    // PORT é o nome que as plataformas de nuvem (Railway, Render...) injetam.
    API_PORT: z.coerce.number().int().positive().optional(),
    PORT: z.coerce.number().int().positive().optional(),
    API_HOST: z.string().default('0.0.0.0'),

    // ---- Sessão (ADR 0009) ----
    /** Chave secreta: o banco guarda o HMAC do token com ela, nunca o token. */
    SESSAO_SEGREDO: z
      .string({ error: 'Defina SESSAO_SEGREDO (gere com: openssl rand -hex 32)' })
      .min(16, 'SESSAO_SEGREDO precisa ter ao menos 16 caracteres'),
    /**
     * Tempo SEM USO até a sessão cair ("12h", "30m", "2d"). Um turno de
     * trabalho: quem entra de manhã não cai no meio da tarde; usar renova.
     */
    SESSAO_DURACAO: z
      .string()
      .regex(/^\d+\s*[mhd]$/, 'SESSAO_DURACAO: use minutos, horas ou dias — ex.: 30m, 12h, 2d')
      .default('12h'),
    /**
     * Cookie só por HTTPS? 'auto' decide pela requisição — liga atrás de um
     * proxy com TLS (nuvem) e desliga no servidor da rede local (http://).
     */
    COOKIE_SECURE: z.enum(['auto', 'true', 'false']).default('auto'),
    /** Atrás de proxy reverso (Caddy, Nginx, nuvem): confiar no X-Forwarded-*. */
    TRUST_PROXY: booleano('false'),

    /**
     * Fuso da oficina. As "datas do dia" (caixa de hoje, relatório do mês)
     * são calculadas nele — e não no fuso do servidor, que na nuvem é UTC.
     */
    TZ: z.string().default('America/Sao_Paulo'),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),

    /** Origens liberadas no CORS (vírgula). Vazio = só a mesma origem (o normal). */
    CORS_ORIGIN: z.string().optional(),

    /** Pasta com a interface já compilada (vite build). A API serve a tela. */
    WEB_DIR: z.string().optional(),

    /** Documentação interativa da API em /api/docs. */
    API_DOCS: z.enum(['true', 'false']).optional(),

    // ---- Backup automático do banco ----
    BACKUP_ENABLED: booleano('true'),
    BACKUP_DIR: z.string().default('./backups'),
    BACKUP_RETENCAO_DIAS: z.coerce.number().int().positive().default(14),
    /**
     * Senha que cifra as cópias (AES-256-GCM). Opcional — mas PERDEU A SENHA,
     * PERDEU AS CÓPIAS: guarde-a fora do servidor. Vazio = cópias em SQL puro.
     */
    BACKUP_SENHA: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.string().min(12, 'BACKUP_SENHA precisa ter ao menos 12 caracteres').optional(),
    ),
    // Container do docker-compose de desenvolvimento. Usado quando o banco é
    // local: garante pg_dump da mesma versão do servidor.
    BACKUP_CONTAINER: z.string().default('hermes-postgres'),
  })
  .superRefine((e, ctx) => {
    if (e.NODE_ENV === 'production' && (e.SESSAO_SEGREDO === SEGREDO_DE_EXEMPLO || e.SESSAO_SEGREDO.length < 32)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSAO_SEGREDO'],
        message: 'Em produção, gere um SESSAO_SEGREDO próprio com ao menos 32 caracteres (ex.: openssl rand -hex 32)',
      });
    }
  });

// Nomes antigos (da época do JWT) continuam valendo, para .env já existentes.
const parsed = schema.safeParse({
  ...process.env,
  SESSAO_SEGREDO: process.env.SESSAO_SEGREDO ?? process.env.JWT_SECRET,
  SESSAO_DURACAO: process.env.SESSAO_DURACAO ?? process.env.JWT_EXPIRES_IN,
});

if (!parsed.success) {
  console.error('❌ Variáveis de ambiente inválidas:');
  for (const issue of parsed.error.issues) console.error(`   ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

const dados = parsed.data;

// O Node lê TZ para toda conta de data "local". Precisa valer antes de
// qualquer new Date() da aplicação — por isso é aplicado aqui, no carregamento.
process.env.TZ = dados.TZ;

/** Procura a tela compilada: WEB_DIR, ou a pasta do monorepo, ou a da imagem Docker. */
function localizarWeb(): string | null {
  // Informada, vale só ela (em teste, aponta para lugar nenhum de propósito).
  if (dados.WEB_DIR) return existsSync(resolve(dados.WEB_DIR, 'index.html')) ? resolve(dados.WEB_DIR) : null;
  const candidatos = [
    resolve(process.cwd(), '../desktop/dist'),
    resolve(process.cwd(), 'apps/desktop/dist'),
    resolve(process.cwd(), 'web'),
  ].filter((c): c is string => !!c);
  return candidatos.find((c) => existsSync(resolve(c, 'index.html'))) ?? null;
}

/** "12h" → milissegundos. */
function duracaoEmMs(texto: string): number {
  const [, n, unidade] = /^(\d+)\s*([mhd])$/.exec(texto)!;
  return Number(n) * { m: 60_000, h: 3_600_000, d: 86_400_000 }[unidade as 'm' | 'h' | 'd'];
}

export const env = {
  ...dados,
  sessaoDuracaoMs: duracaoEmMs(dados.SESSAO_DURACAO),
  porta: dados.API_PORT ?? dados.PORT ?? 3333,
  producao: dados.NODE_ENV === 'production',
  docs: dados.API_DOCS ? dados.API_DOCS === 'true' : dados.NODE_ENV !== 'production',
  corsOrigens: dados.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean) ?? [],
  webDir: localizarWeb(),
};
