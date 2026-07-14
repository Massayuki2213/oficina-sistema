import { z } from 'zod';

// Valida as variáveis de ambiente na inicialização (falha cedo e claro).
const schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  API_PORT: z.coerce.number().default(3333),
  API_HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET precisa ter ao menos 16 caracteres'),
  JWT_EXPIRES_IN: z.string().default('8h'),

  // ---- Backup automático do banco ----
  BACKUP_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  BACKUP_DIR: z.string().default('./backups'),
  BACKUP_RETENCAO_DIAS: z.coerce.number().int().positive().default(14),
  // Container do docker-compose. Usado quando o banco é local: garante que o
  // pg_dump tem a mesma versão do servidor, sem depender do Postgres instalado.
  BACKUP_CONTAINER: z.string().default('hermes-postgres'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variáveis de ambiente inválidas:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
