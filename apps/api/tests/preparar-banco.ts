import { execSync } from 'node:child_process';

// ============================================================
// Prepara o banco de TESTE: cria (o Prisma cria sozinho se faltar)
// e aplica as migrations. Roda com `npm run test:prepare`.
//
// O banco de teste é separado de propósito: os testes dão TRUNCATE
// nas tabelas, e apontar para o banco de trabalho apagaria o
// cenário de demonstração.
// ============================================================

const URL_TESTE =
  process.env.TEST_DATABASE_URL ?? 'postgresql://hermes:hermes_dev@localhost:5434/hermes_test?schema=public';

try {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: URL_TESTE },
  });
  console.log('\n✅ banco de teste pronto — rode `npm test`');
} catch {
  console.error('\n❌ não consegui preparar o banco de teste.');
  console.error('   O Docker está de pé? Rode `npm run infra:up` na raiz.');
  console.error(`   Banco esperado: ${URL_TESTE.replace(/:[^:@]+@/, ':***@')}`);
  console.error('   Se a sua porta do Postgres não for a 5434, defina TEST_DATABASE_URL.');
  process.exit(1);
}
