#!/usr/bin/env bash
# ==========================================================
# Hermes — cópia dos backups na nuvem com o rclone. OPCIONAL, desligada
# até alguém ativar.
#
#   sudo rclone config                                  # 1. cria o "remoto" (Google Drive, etc.)
#   sudo /opt/hermes/ops/nuvem.sh ativar gdrive:hermes  # 2. liga a cópia diária para lá
#   sudo /opt/hermes/ops/nuvem.sh status
#   sudo /opt/hermes/ops/nuvem.sh enviar                # manda agora (o timer faz todo dia)
#   sudo /opt/hermes/ops/nuvem.sh desativar
#
# Só vão cópias CIFRADAS (.sql.enc): sem BACKUP_SENHA no .env, não ativa.
# Na nuvem ficam as dos últimos NUVEM_RETENCAO_DIAS (90 por padrão).
# ==========================================================
set -euo pipefail
source "$(dirname "$0")/comum.sh"

UNIDADE=hermes-nuvem

destino() { ler_env NUVEM_DESTINO; }
retencao() { local d; d=$(ler_env NUVEM_RETENCAO_DIAS); echo "${d:-90}"; }

precisa_cifra() {
  [ -n "$(ler_env BACKUP_SENHA)" ] ||
    erro "A cópia na nuvem precisa ser cifrada: defina BACKUP_SENHA no $ENV_ARQ (veja o manual) e rode: sudo docker compose -f $COMPOSE_ARQ up -d"
}

enviar() {
  local dest
  dest=$(destino)
  [ -n "$dest" ] || erro "A cópia na nuvem está desligada. Para ligar: sudo $0 ativar <remoto:pasta>"
  precisa_cifra
  # copy (nunca sync): apagar uma cópia no mini PC não apaga a da nuvem.
  rclone copy "$(pasta_backups)" "$dest" --include 'hermes-*.sql.enc' --max-age 7d --no-traverse
  rclone delete "$dest" --include 'hermes-*.sql.enc' --min-age "$(retencao)d"
  ok "Cópias cifradas enviadas para $dest"
}

ativar() {
  local dest=${1:-}
  [ -n "$dest" ] || erro "Diga para onde: sudo $0 ativar <remoto:pasta> (o remoto vem do 'sudo rclone config')."
  precisa_cifra
  if ! command -v rclone >/dev/null; then
    passo "Instalando o rclone"
    apt-get install -y -q rclone
  fi
  rclone listremotes | grep -qx "${dest%%:*}:" ||
    erro "O remoto '${dest%%:*}' não existe. Crie com: sudo rclone config"
  rclone mkdir "$dest" || erro "Não consegui gravar em $dest."

  gravar_env NUVEM_DESTINO "$dest"
  cat >/etc/systemd/system/$UNIDADE.service <<EOF
[Unit]
Description=Hermes: copia os backups cifrados para a nuvem
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=$HERMES_DIR/ops/nuvem.sh enviar
EOF
  cat >/etc/systemd/system/$UNIDADE.timer <<EOF
[Unit]
Description=Hermes: cópia diária dos backups para a nuvem

[Timer]
OnCalendar=*-*-* 13:00
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now $UNIDADE.timer
  ok "Cópia diária para $dest ligada (por volta das 13h; se o PC estiver desligado, vai quando ligar)."
  passo "Primeira cópia"
  enviar
}

desativar() {
  systemctl disable --now $UNIDADE.timer 2>/dev/null || true
  rm -f /etc/systemd/system/$UNIDADE.service /etc/systemd/system/$UNIDADE.timer
  systemctl daemon-reload
  gravar_env NUVEM_DESTINO ''
  ok "Cópia na nuvem desligada (o que já está lá continua lá)."
}

status() {
  local dest
  dest=$(destino)
  if [ -z "$dest" ]; then
    info "Cópia na nuvem: desligada."
    return
  fi
  info "Cópia na nuvem: ligada, para $dest (guarda $(retencao) dias)."
  systemctl list-timers $UNIDADE.timer --no-pager 2>/dev/null | sed 's/^/    /' || true
  info "Mais novas lá:"
  rclone lsl "$dest" --include 'hermes-*.sql.enc' 2>/dev/null | sort -k2,3 -r | head -n 5 | sed 's/^/      /' || aviso "Não consegui listar $dest."
}

main() {
  precisa_root "$@"
  case "${1:-status}" in
    ativar) ativar "${2:-}" ;;
    enviar) enviar ;;
    desativar) desativar ;;
    status) status ;;
    *) erro "Uso: sudo $0 ativar <remoto:pasta> | enviar | status | desativar" ;;
  esac
}

main "$@"
