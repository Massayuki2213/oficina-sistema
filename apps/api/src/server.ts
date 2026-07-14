import { buildApp } from './app.js';
import { env } from './lib/env.js';
import { connectDatabase, disconnectDatabase } from './lib/prisma.js';
import { connectRedis, disconnectRedis } from './lib/redis.js';
import { iniciarAgendadorDeBackup } from './modules/backup/backup.service.js';

async function main() {
  await connectDatabase();
  await connectRedis();

  const app = buildApp();

  await app.listen({ port: env.API_PORT, host: env.API_HOST });
  console.log(`🚀 Hermes API rodando em http://localhost:${env.API_PORT}`);

  // Cópia de segurança diária do banco (roda também se o PC ficou desligado).
  const pararBackup = iniciarAgendadorDeBackup();

  // Encerramento gracioso
  const shutdown = async () => {
    console.log('\n⏹  Encerrando...');
    pararBackup();
    await app.close();
    await disconnectDatabase();
    await disconnectRedis();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Falha ao iniciar a API:', err);
  process.exit(1);
});
