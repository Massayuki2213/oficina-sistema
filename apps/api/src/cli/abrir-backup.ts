// ============================================================
// Abre uma cópia cifrada (.sql.enc) e escreve o SQL — para restaurar.
// A senha vem de BACKUP_SENHA (no container ela já está lá); nunca
// por argumento, que ficaria no histórico do terminal.
//
//   docker compose -f docker-compose.prod.yml exec -T app \
//     node dist/abrir-backup.js /app/backups/hermes-2026-09-30_093635.sql.enc > restaurar.sql
// ============================================================

import { createWriteStream } from 'node:fs';
import { decifrarArquivo, SenhaOuArquivoInvalido } from '../lib/cofre.js';

const [arquivo, saida] = process.argv.slice(2);
const senha = process.env.BACKUP_SENHA;

if (!arquivo) {
  console.error('Uso: abrir-backup <arquivo.sql.enc> [saida.sql]   (sem saída: escreve no terminal)');
  process.exit(2);
}
if (!senha) {
  console.error('Defina BACKUP_SENHA com a senha das cópias (a mesma do .env do servidor).');
  process.exit(2);
}

try {
  await decifrarArquivo(arquivo, senha, saida ? createWriteStream(saida) : process.stdout);
  if (saida) console.error(`Pronto: ${saida}`);
} catch (err) {
  console.error(err instanceof SenhaOuArquivoInvalido ? err.message : `Falhou: ${(err as Error).message}`);
  process.exit(1);
}
