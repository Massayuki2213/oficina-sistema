#!/usr/bin/env bash
# ==========================================================
# Hermes — funções comuns dos scripts de ops/. Não se roda sozinho:
# cada script carrega este arquivo com `source`.
#
# A pasta do Hermes no mini PC (/opt/hermes) é um clone do repositório
# parado numa versão (git checkout v1.0.0): scripts, docker-compose e
# imagem andam sempre juntos. O .env (senhas) fica nela e nunca vai
# para o git.
# ==========================================================

HERMES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_ARQ="$HERMES_DIR/docker-compose.prod.yml"
ENV_ARQ="$HERMES_DIR/.env"

# Dono das pastas de backup: o usuário "node" de dentro da imagem (uid 1000).
# shellcheck disable=SC2034
UID_APP=1000

# ---- Mensagens ----------------------------------------------------------------
if [ -t 1 ]; then
  AZUL=$'\e[1;34m' VERDE=$'\e[1;32m' AMARELO=$'\e[1;33m' VERMELHO=$'\e[1;31m' NORMAL=$'\e[0m'
else
  AZUL='' VERDE='' AMARELO='' VERMELHO='' NORMAL=''
fi
passo() { printf '\n%s==> %s%s\n' "$AZUL" "$*" "$NORMAL"; }
ok() { printf '%s  ✔ %s%s\n' "$VERDE" "$*" "$NORMAL"; }
info() { printf '    %s\n' "$*"; }
aviso() { printf '%s  ! %s%s\n' "$AMARELO" "$*" "$NORMAL" >&2; }
erro() {
  printf '\n%s  ✘ %s%s\n' "$VERMELHO" "$*" "$NORMAL" >&2
  exit 1
}

precisa_root() {
  [ "$(id -u)" -eq 0 ] || erro "Rode com sudo: sudo $0 $*"
}

# Pergunta sim/não. Lê a resposta da entrada padrão (dá para responder por pipe).
#   perguntar "Configurar agora?" s   → padrão sim
perguntar() {
  local resposta padrao=${2:-n} opcoes='[s/N]'
  [ "$padrao" = s ] && opcoes='[S/n]'
  read -r -p "    $1 $opcoes " resposta || resposta=''
  resposta=${resposta:-$padrao}
  [[ $resposta =~ ^[sSyY] ]]
}

# ---- .env -----------------------------------------------------------------------
# Lê uma variável do .env sem executar o arquivo (aspas em volta são tiradas).
ler_env() {
  [ -f "$ENV_ARQ" ] || return 0
  sed -n "s/^$1=//p" "$ENV_ARQ" | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

# Grava (ou troca) uma variável no .env.
gravar_env() {
  if grep -q "^$1=" "$ENV_ARQ"; then
    sed -i "s|^$1=.*|$1=$2|" "$ENV_ARQ"
  else
    printf '%s=%s\n' "$1" "$2" >>"$ENV_ARQ"
  fi
}

pasta_backups() { local p; p=$(ler_env HERMES_BACKUPS); echo "${p:-/srv/hermes/backups}"; }
ponto_hd() { local p; p=$(ler_env HERMES_HD_EXTERNO); echo "${p:-/mnt/hermes-backup}"; }
# shellcheck disable=SC2034
MARCA_HD=.hermes-hd-externo

# ---- Docker ---------------------------------------------------------------------
# docker compose sempre com o arquivo e o .env do Hermes, de qualquer pasta.
dc() {
  docker compose --project-directory "$HERMES_DIR" -f "$COMPOSE_ARQ" --env-file "$ENV_ARQ" "$@"
}

app_rodando() {
  [ -n "$(dc ps -q --status running app 2>/dev/null)" ]
}

# Espera o sistema responder "ok" com o banco no ar. Pergunta de dentro do
# container, então não depende da porta 80 nem da rede.
esperar_saude() {
  local limite=${1:-180} passou=0
  while [ "$passou" -lt "$limite" ]; do
    if dc exec -T app node -e "fetch('http://127.0.0.1:3333/api/health').then(r=>r.json()).then(j=>process.exit(j.status==='ok'&&j.banco==='up'?0:1)).catch(()=>process.exit(1))" </dev/null >/dev/null 2>&1; then
      return 0
    fi
    sleep 3
    passou=$((passou + 3))
  done
  return 1
}

esperar_banco() {
  local passou=0
  until dc exec -T db pg_isready -q -U hermes -d hermes </dev/null >/dev/null 2>&1; do
    [ "$passou" -lt 60 ] || return 1
    sleep 2
    passou=$((passou + 2))
  done
}

# Backup agora, pelo próprio sistema (mesma cifra e cópia no HD do automático).
# Escreve o nome do arquivo na saída; as mensagens aparecem na tela.
backup_agora() {
  dc exec -T app node dist/fazer-backup.js </dev/null
}

# IP do mini PC na rede da oficina (o que o roteador entregou).
ip_da_rede() {
  ip route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i < NF; i++) if ($i == "src") { print $(i + 1); exit }}'
}
