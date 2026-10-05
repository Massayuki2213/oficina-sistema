// ============================================================
// Faz um backup agora, igual ao automático: mesma pasta, mesma cifra
// (BACKUP_SENHA), mesma cópia no HD externo. Usado pelos scripts de ops/
// (antes de atualizar ou restaurar) e pelo suporte.
//
//   docker compose -f docker-compose.prod.yml exec -T app node dist/fazer-backup.js
//
// Na saída padrão vai só o nome do arquivo (os scripts guardam); as
// mensagens vão para a saída de erro, que aparece na tela.
// ============================================================

import { gerarBackup, statusBackup } from '../modules/backup/backup.service.js';

const NO_HD = {
  ok: 'copiado também para o HD externo',
  ausente: 'o HD externo NÃO está conectado: a cópia ficou só no SSD',
  falhou: 'não consegui gravar no HD externo',
  desligado: 'sem HD externo configurado',
} as const;

try {
  const feito = await gerarBackup();
  const erroHd = feito.hdExterno === 'falhou' ? (await statusBackup()).hdExterno?.erro : null;
  console.error(`Backup feito: ${feito.arquivo} (${Math.round(feito.bytes / 1024)} KB); ${NO_HD[feito.hdExterno]}${erroHd ? ` (${erroHd})` : ''}.`);
  console.log(feito.arquivo);
} catch (err) {
  console.error(`Backup falhou: ${(err as Error).message}`);
  process.exit(1);
}
