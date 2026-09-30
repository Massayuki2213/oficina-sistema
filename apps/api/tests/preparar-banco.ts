import { execSync } from 'node:child_process';
import { prepararUsuarioDaAplicacao } from '../src/lib/usuario-do-banco';
import { SENHA_APP_TESTE, URL_TESTE } from './banco-teste';

// ============================================================
// Prepara o banco de TESTE: cria (o Prisma cria sozinho se faltar),
// aplica as migrations e prepara o usuário da aplicação — como a
// partida do container faz em produção. Roda com `npm run test:prepare`.
//
// O banco de teste é separado de propósito: os testes dão TRUNCATE
// nas tabelas, e apontar para o banco de trabalho apagaria o
// cenário de demonstração.
// ============================================================

try {
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: URL_TESTE },
  });
  await prepararUsuarioDaAplicacao(URL_TESTE, SENHA_APP_TESTE);
  console.log('\n✅ banco de teste pronto — rode `npm test`');
} catch (err) {
  console.error(`\n❌ não consegui preparar o banco de teste: ${(err as Error).message}`);
  console.error('   O Docker está de pé? Rode `npm run infra:up` na raiz.');
  console.error(`   Banco esperado: ${URL_TESTE.replace(/:[^:@]+@/, ':***@')}`);
  console.error('   A porta vem de POSTGRES_PORT (.env); para outro servidor, defina TEST_DATABASE_URL');
  console.error('   (com um usuário que possa criar usuários — o hermes do docker-compose pode).');
  process.exit(1);
}
