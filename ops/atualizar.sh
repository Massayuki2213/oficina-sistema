#!/usr/bin/env bash
# ==========================================================
# Hermes — atualiza (ou volta) a versão do sistema.
#
#   sudo /opt/hermes/ops/atualizar.sh            # mostra a versão atual e as disponíveis
#   sudo /opt/hermes/ops/atualizar.sh v1.0.1     # atualiza para a v1.0.1
#   sudo /opt/hermes/ops/atualizar.sh v1.0.0     # volta para a v1.0.0 (o mesmo caminho)
#
# Nesta ordem:
#  1. confere que a versão existe (GitHub);
#  2. faz um backup agora. Se falhar, para sem mexer em nada;
#  3. traz os scripts e o docker-compose da versão (git checkout) e baixa a
#     imagem dela. Se o download falhar, volta os arquivos e para;
#  4. troca HERMES_VERSAO no .env e sobe a versão nova (as migrações do
#     banco rodam sozinhas na partida);
#  5. espera o sistema responder. Se não responder, mostra o log e diz
#     como voltar.
# ==========================================================
set -euo pipefail
source "$(dirname "$0")/comum.sh"

VERSAO_VALIDA='^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$'

git_h() { git -C "$HERMES_DIR" "$@"; }

versoes_disponiveis() {
  git_h tag -l 'v*' --sort=v:refname | tail -n 8 | sed 's/^/      /'
}

main() {
  precisa_root "$@"
  [ -f "$ENV_ARQ" ] || erro "Não achei $ENV_ARQ. O Hermes foi instalado com o ops/instalar.sh?"
  local atual nova antes='' commit_antes
  atual=$(ler_env HERMES_VERSAO)

  if [ $# -eq 0 ]; then
    git_h fetch --tags --force --quiet origin 2>/dev/null || aviso "Sem acesso ao GitHub agora: mostrando as versões já conhecidas."
    echo "    Versão instalada: ${atual:-?}"
    echo "    Versões disponíveis (a mais nova por último):"
    versoes_disponiveis
    echo "    Para atualizar: sudo $0 <versão>"
    exit 0
  fi

  nova=$1
  [[ $nova =~ $VERSAO_VALIDA ]] || erro "Versão inválida: $nova (o formato é v1.0.1)."
  [ "$nova" != "$atual" ] || {
    ok "Já está na $nova."
    exit 0
  }

  passo "1/5 Conferindo a $nova"
  git_h fetch --tags --force --quiet origin || erro "Não consegui falar com o GitHub (internet?). Nada foi alterado."
  git_h rev-parse -q --verify "refs/tags/$nova" >/dev/null || {
    echo "    Versões disponíveis:"
    versoes_disponiveis
    erro "A versão $nova não existe."
  }
  ok "$atual → $nova"

  passo "2/5 Backup antes de trocar"
  if app_rodando; then
    antes=$(backup_agora) || erro "O backup falhou (motivo acima). Nada foi alterado: resolva isso antes de atualizar."
    ok "Guardado: $(pasta_backups)/$antes"
  else
    aviso "O sistema não está no ar: sem backup agora. O automático mais recente fica em $(pasta_backups)."
    perguntar "Continuar mesmo assim?" n || erro "Cancelado: nada foi alterado."
  fi

  passo "3/5 Baixando a $nova"
  commit_antes=$(git_h rev-parse HEAD)
  git_h -c advice.detachedHead=false checkout --quiet "refs/tags/$nova" ||
    erro "Não consegui trocar os arquivos para a $nova (alguém mexeu em $HERMES_DIR? veja: sudo git -C $HERMES_DIR status)."
  # O valor da linha de comando vale mais que o do .env: baixa sem trocar nada ainda.
  if ! HERMES_VERSAO="$nova" dc pull app </dev/null; then
    git_h checkout --quiet "$commit_antes"
    erro "Não consegui baixar a imagem da $nova. Nada foi alterado."
  fi
  ok "Imagem da $nova baixada"

  passo "4/5 Trocando a versão"
  gravar_env HERMES_VERSAO_ANTERIOR "$atual"
  gravar_env HERMES_VERSAO "$nova"
  dc up -d --remove-orphans </dev/null

  passo "5/5 Esperando o sistema responder (até 4 minutos)"
  if esperar_saude 240; then
    ok "Hermes $nova no ar."
    info "Se algo estiver errado, volte com: sudo $0 $atual"
  else
    dc logs --tail 40 app </dev/null || true
    aviso "A $nova não respondeu (log acima)."
    info "Para voltar à versão anterior: sudo $0 $atual"
    [ -z "$antes" ] || info "Se depois de voltar os dados estiverem errados: sudo $HERMES_DIR/ops/restaurar.sh $(pasta_backups)/$antes"
    exit 1
  fi
}

main "$@"
