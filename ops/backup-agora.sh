#!/usr/bin/env bash
# ==========================================================
# Hermes — faz um backup do banco agora.
#
#   sudo /opt/hermes/ops/backup-agora.sh
#
# É o mesmo backup do botão "Fazer backup agora" (Configurações → Backup):
# vai para /srv/hermes/backups e, se o HD externo estiver conectado, para
# ele também. Com BACKUP_SENHA no .env, sai cifrado.
# ==========================================================
set -euo pipefail
source "$(dirname "$0")/comum.sh"

main() {
  precisa_root "$@"
  app_rodando || erro "O Hermes não está no ar. Veja com: sudo docker compose -f $COMPOSE_ARQ ps"

  passo "Fazendo um backup agora"
  local arquivo
  arquivo=$(backup_agora) || erro "O backup falhou (motivo acima)."
  ok "Pronto: $(pasta_backups)/$arquivo"
}

main "$@"
