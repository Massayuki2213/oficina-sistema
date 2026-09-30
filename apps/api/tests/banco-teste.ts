import { urlDaAplicacao } from '../src/lib/usuario-do-banco';

/**
 * Banco dos testes: TEST_DATABASE_URL, ou o Postgres do docker-compose de
 * desenvolvimento (porta POSTGRES_PORT do .env) com o banco `hermes_test`.
 * Nunca o banco de trabalho — os testes apagam as tabelas.
 *
 * É a conexão do DONO do banco: migrações e a faxina entre os testes (TRUNCATE).
 */
export const URL_TESTE =
  process.env.TEST_DATABASE_URL ??
  `postgresql://hermes:hermes_dev@localhost:${process.env.POSTGRES_PORT ?? 5432}/hermes_test?schema=public`;

/** Senha fixa do hermes_app nos testes (em produção ela é sorteada a cada partida). */
export const SENHA_APP_TESTE = 'hermes_app_teste';

/**
 * A API testada conecta como em produção: com o usuário que só lê e grava
 * dados. Se algum código precisar de mais que isso, o teste quebra aqui.
 */
export const URL_TESTE_APP = urlDaAplicacao(URL_TESTE, SENHA_APP_TESTE);
