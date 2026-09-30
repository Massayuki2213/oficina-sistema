#!/bin/sh
# Hermes — partida do container: aplica as migrações pendentes, prepara o
# usuário do banco da aplicação e sobe o servidor.
# (Migração é idempotente: sem nada novo, não faz nada.)
set -e
echo "Hermes: aplicando migrações do banco..."
npx --no-install prisma migrate deploy --schema ./prisma/schema.prisma

# Menor privilégio (ADR 0007): a DATABASE_URL recebida é a do dono do banco e
# só serve às migrações acima. O servidor conecta como hermes_app, que só lê e
# grava dados — com uma senha nova, sorteada a cada partida. Se não der para
# criar o usuário, a partida para aqui (a mensagem diz o que fazer).
if [ "${DB_USUARIO_APP:-true}" != "false" ]; then
  DATABASE_URL="$(node dist/usuario-do-banco.js)"
  export DATABASE_URL
fi

echo "Hermes: iniciando o servidor..."
exec node dist/server.js
