import { VERSAO } from '@hermes/shared';
import { env } from './lib/env.js';
import { prisma } from './lib/prisma.js';
import { buildApp } from './app.js';
import { iniciarAgendadorDeBackup } from './modules/backup/backup.service.js';

async function main() {
  const app = await buildApp();

  await prisma.$connect();
  await app.listen({ port: env.porta, host: env.API_HOST });
  app.log.info(`🚀 Hermes ${VERSAO} em http://localhost:${env.porta} (fuso ${env.TZ})`);
  if (!env.webDir) app.log.info('🖥️  Interface não encontrada — só a API está no ar (rode o build da tela para servi-la).');
  if (env.docs) app.log.info(`📚 Documentação da API em http://localhost:${env.porta}/api/docs`);

  // Cópia de segurança diária do banco (roda também se o PC ficou desligado).
  const pararBackup = iniciarAgendadorDeBackup((msg) => app.log.info(msg));

  // Encerramento gracioso: termina as requisições em andamento antes de sair.
  let encerrando = false;
  const encerrar = async (sinal: string) => {
    if (encerrando) return;
    encerrando = true;
    app.log.info(`⏹  Encerrando (${sinal})...`);
    pararBackup();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once('SIGINT', () => void encerrar('SIGINT'));
  process.once('SIGTERM', () => void encerrar('SIGTERM'));
}

process.on('unhandledRejection', (motivo) => {
  console.error('Promessa rejeitada sem tratamento:', motivo);
});

main().catch((err) => {
  console.error('Falha ao iniciar a API:', err);
  process.exit(1);
});
