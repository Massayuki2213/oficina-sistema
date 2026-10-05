#!/usr/bin/env bash
# ==========================================================
# Hermes — mantém o HD externo de backup montado.
#
# Roda sozinho a cada 5 minutos (hermes-hd.timer, criado pelo instalar.sh):
#  - HD conectado e não montado (foi plugado depois do boot): monta no
#    ponto do fstab. A montagem aparece dentro do container (rslave);
#  - HD arrancado com a montagem ainda pendurada: desmonta, para o
#    sistema ver que ele saiu e avisar o Dono;
#  - sem HD no fstab: não faz nada.
#
# À mão: sudo /opt/hermes/ops/hd-montar.sh
# ==========================================================
set -uo pipefail
source "$(dirname "$0")/comum.sh"

main() {
  precisa_root "$@"
  local ponto origem
  ponto=$(ponto_hd)

  if mountpoint -q "$ponto"; then
    origem=$(findmnt -no SOURCE "$ponto")
    if [ ! -b "$origem" ]; then
      umount -l "$ponto" && echo "HD externo saiu ($origem): montagem desfeita."
    fi
    exit 0
  fi

  grep -qs "^[^#].*[[:space:]]${ponto}[[:space:]]" /etc/fstab || exit 0
  # Sem o HD conectado, o mount falha na hora: tenta de novo na próxima rodada.
  if mount "$ponto" 2>/dev/null; then
    echo "HD externo montado em $ponto."
  fi
  exit 0
}

main "$@"
