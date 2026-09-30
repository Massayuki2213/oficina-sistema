import { PrismaClient } from '@prisma/client';

// ============================================================
// Menor privilégio no banco (ADR 0007).
//
// O dono do banco — quem cria e altera tabelas — serve só às
// migrações. O servidor conecta como `hermes_app`, que lê e grava
// DADOS e nada mais: não cria, altera nem apaga tabela, não dá
// TRUNCATE, não é superusuário. Se um dia escapar uma injeção de
// SQL, o estrago para no que a própria tela já alcança — sem DROP,
// sem COPY ... TO PROGRAM (comando no servidor), sem outros bancos.
// ============================================================

export const USUARIO_APP = 'hermes_app';

/** A mesma conexão, com o usuário e a senha da aplicação. */
export function urlDaAplicacao(urlDono: string, senha: string): string {
  const url = new URL(urlDono);
  url.username = USUARIO_APP;
  url.password = senha;
  return url.toString();
}

/**
 * Cria (ou atualiza) o usuário da aplicação e libera DML em todas as tabelas
 * do schema. Idempotente: roda a cada partida, DEPOIS das migrações — tabela
 * nova já nasce liberada. Precisa ser chamado com a URL do dono do banco.
 * Devolve a DATABASE_URL que o servidor deve usar.
 */
export async function prepararUsuarioDaAplicacao(urlDono: string, senha: string): Promise<string> {
  const schema = new URL(urlDono).searchParams.get('schema') ?? 'public';
  const db = new PrismaClient({ datasourceUrl: urlDono });
  try {
    const [{ existe }] = await db.$queryRaw<{ existe: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${USUARIO_APP}) AS existe`;

    // Comando de papel não aceita parâmetro: o format() do próprio Postgres
    // cita o nome (%I) e a senha (%L) — nada é colado como texto cru.
    const verbo = existe ? 'ALTER' : 'CREATE';
    const [{ papel, s }] = await db.$queryRaw<{ papel: string; s: string }[]>`
      SELECT format(${`${verbo} ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L`}::text,
                    ${USUARIO_APP}::text, ${senha}::text) AS papel,
             quote_ident(${schema}::text) AS s`;
    await db.$executeRawUnsafe(papel);

    for (const comando of [
      `GRANT USAGE ON SCHEMA ${s} TO ${USUARIO_APP}`,
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${s} TO ${USUARIO_APP}`,
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${s} TO ${USUARIO_APP}`,
      // Tabelas criadas depois (restauração de backup, migração) herdam o mesmo.
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${USUARIO_APP}`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} GRANT USAGE, SELECT ON SEQUENCES TO ${USUARIO_APP}`,
    ]) {
      await db.$executeRawUnsafe(comando);
    }
  } finally {
    await db.$disconnect();
  }
  return urlDaAplicacao(urlDono, senha);
}
