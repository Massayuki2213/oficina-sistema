// ============================================================
// Partida do container (docker/entrypoint.sh), depois das migrações:
// prepara o usuário do banco da aplicação com uma senha nova, sorteada
// a cada partida, e imprime a DATABASE_URL dele.
//
// A URL é a ÚNICA coisa que vai para a saída padrão — o script a
// captura. Mensagens vão para a saída de erro (aparecem no log).
//
//   DATABASE_URL="$(node dist/usuario-do-banco.js)"
// ============================================================

import { randomBytes } from 'node:crypto';
import { prepararUsuarioDaAplicacao, USUARIO_APP } from '../lib/usuario-do-banco.js';

const urlDono = process.env.DATABASE_URL;
if (!urlDono) {
  console.error('Hermes: DATABASE_URL não definida.');
  process.exit(2);
}

try {
  const url = await prepararUsuarioDaAplicacao(urlDono, randomBytes(24).toString('hex'));
  process.stdout.write(url);
  console.error(`Hermes: o servidor conecta ao banco como "${USUARIO_APP}" (só lê e grava dados).`);
} catch (err) {
  console.error(`Hermes: não consegui preparar o usuário "${USUARIO_APP}" no banco: ${(err as Error).message}`);
  console.error('   O usuário da DATABASE_URL precisa poder criar usuários (o do docker-compose pode).');
  console.error('   Banco gerenciado que não deixa? Defina DB_USUARIO_APP=false: o servidor usa a DATABASE_URL como está.');
  process.exit(1);
}
