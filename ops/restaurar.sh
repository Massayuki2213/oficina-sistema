#!/usr/bin/env bash
# ==========================================================
# Hermes — restaura uma cópia do banco. SUBSTITUI TODOS OS DADOS ATUAIS.
#
#   sudo /opt/hermes/ops/restaurar.sh            # escolhe numa lista (SSD e HD externo)
#   sudo /opt/hermes/ops/restaurar.sh <arquivo>  # .sql ou .sql.enc, de qualquer pasta (ex.: pendrive)
#
# Nesta ordem:
#  1. mostra a cópia e pede para digitar RESTAURAR;
#  2. faz um backup do estado atual (é por ele que se desfaz a restauração);
#  3. abre a cópia (se cifrada, com a BACKUP_SENHA do .env) e confere que é
#     um backup do Hermes. Senha errada ou arquivo mexido: para aqui;
#  4. para o sistema (o banco continua de pé) e restaura numa transação só.
#     Qualquer erro no meio desfaz tudo: o banco fica exatamente como estava;
#  5. encerra as sessões (todo mundo entra de novo) e sobe o sistema, que
#     aplica as migrações se a cópia for de uma versão anterior.
# ==========================================================
set -euo pipefail
source "$(dirname "$0")/comum.sh"

TMP=''
PAROU_APP=0

# Ao sair por qualquer motivo (erro, Ctrl+C): apaga o SQL aberto e, se o
# sistema ficou parado no meio, sobe de novo.
limpar() {
  [ -n "$TMP" ] && rm -rf "$TMP"
  if [ "$PAROU_APP" = 1 ]; then
    dc up -d </dev/null >/dev/null 2>&1 || true
  fi
}

data_de() { date -r "$1" '+%d/%m/%Y %H:%M'; }

# Cópias do SSD e do HD externo (se conectado), da mais nova para a mais antiga.
listar_copias() {
  local pastas=("$(pasta_backups)") hd
  hd=$(ponto_hd)
  [ -f "$hd/$MARCA_HD" ] && pastas+=("$hd")
  find "${pastas[@]}" -maxdepth 1 -type f \( -name 'hermes-*.sql' -o -name 'hermes-*.sql.enc' \) -printf '%T@ %p\n' 2>/dev/null |
    sort -rn | cut -d' ' -f2-
}

# Mostra as 15 mais novas e devolve a escolhida (a lista vai para a tela).
escolher_copia() {
  local copias c n i=1 hd
  mapfile -t copias < <(listar_copias | head -n 15)
  [ "${#copias[@]}" -gt 0 ] ||
    erro "Nenhuma cópia em $(pasta_backups) nem no HD externo. Passe o arquivo: sudo $0 /caminho/hermes-....sql"
  hd=$(ponto_hd)
  echo "    Cópias encontradas (a mais nova primeiro):" >&2
  for c in "${copias[@]}"; do
    printf '    %2d) %s  %-3s %6s  %s\n' "$i" "$(data_de "$c")" "$([[ $c == "$hd"/* ]] && echo HD || echo SSD)" \
      "$(du -h "$c" | cut -f1)" "$(basename "$c")" >&2
    i=$((i + 1))
  done
  read -r -p "    Qual restaurar? [1] " n || n=''
  n=${n:-1}
  { [[ $n =~ ^[0-9]+$ ]] && [ "$n" -ge 1 ] && [ "$n" -le "${#copias[@]}" ]; } || erro "Opção inválida: $n"
  echo "${copias[$((n - 1))]}"
}

# A cópia cifrada é aberta dentro do container, que tem a senha e enxerga a
# pasta de backups e o HD. Arquivo de outro lugar (pendrive) vem para a pasta antes.
caminho_no_container() {
  local arquivo=$1 nome bk hd
  nome=$(basename "$arquivo")
  bk=$(realpath -m "$(pasta_backups)")
  hd=$(realpath -m "$(ponto_hd)")
  case "$(dirname "$arquivo")" in
    "$bk") echo "/app/backups/$nome" ;;
    "$hd") echo "/app/backups-externo/$nome" ;;
    *)
      if [ -e "$bk/$nome" ]; then
        cmp -s "$arquivo" "$bk/$nome" || erro "Já existe outra cópia com o nome $nome em $bk. Renomeie o arquivo e tente de novo."
      else
        install -o "$UID_APP" -g "$UID_APP" -m 640 "$arquivo" "$bk/$nome"
        info "Cópia trazida para $bk/$nome" >&2
      fi
      echo "/app/backups/$nome"
      ;;
  esac
}

main() {
  precisa_root "$@"
  [ -f "$ENV_ARQ" ] || erro "Não achei $ENV_ARQ. O Hermes foi instalado com o ops/instalar.sh?"
  trap limpar EXIT

  local arquivo nome confirma antes='' sql
  if [ $# -ge 1 ]; then
    arquivo=$(realpath -e "$1" 2>/dev/null) || erro "Arquivo não encontrado: $1"
  else
    passo "Escolha a cópia"
    arquivo=$(escolher_copia)
  fi
  nome=$(basename "$arquivo")
  case "$nome" in
    *.sql | *.sql.enc) ;;
    *) erro "Não parece uma cópia do Hermes (esperava .sql ou .sql.enc): $nome" ;;
  esac

  passo "Restaurar $nome"
  info "Cópia de $(data_de "$arquivo"), $(du -h "$arquivo" | cut -f1)."
  aviso "TODOS os dados atuais do Hermes serão SUBSTITUÍDOS pelos desta cópia."
  read -r -p "    Para continuar, digite RESTAURAR: " confirma || confirma=''
  [ "$confirma" = RESTAURAR ] || erro "Cancelado: nada foi alterado."

  # SQL aberto só existe aqui dentro, legível só pelo root, e some ao sair.
  TMP=$(mktemp -d /var/tmp/hermes-restaurar.XXXXXX)
  sql="$TMP/restaurar.sql"

  passo "1/4 Backup do estado atual (para poder desfazer)"
  if app_rodando && antes=$(backup_agora); then
    ok "Guardado: $(pasta_backups)/$antes"
  else
    antes=''
    aviso "Não consegui fazer o backup do estado atual (o sistema está fora do ar?)."
    perguntar "Restaurar mesmo assim, sem esse backup?" n || erro "Cancelado: nada foi alterado."
  fi

  passo "2/4 Conferindo a cópia"
  if [[ $nome == *.enc ]]; then
    local no_container
    no_container=$(caminho_no_container "$arquivo")
    # Abre para um arquivo e só segue se a senha e a integridade conferirem:
    # mandar direto para o banco gravaria um arquivo mexido antes da conferência.
    dc run --rm --no-deps -T --entrypoint node app dist/abrir-backup.js "$no_container" </dev/null >"$sql" ||
      erro "Não consegui abrir a cópia cifrada (motivo acima). Nada foi alterado."
  else
    cp "$arquivo" "$sql"
  fi
  head -n 5 "$sql" | grep -q 'PostgreSQL database dump' ||
    erro "$nome não é um backup do banco (não começa como um pg_dump). Nada foi alterado."
  # Cópia cortada no meio (pendrive arrancado, download pela metade) restauraria
  # só uma parte sem dar erro: o pg_dump sempre termina com esta linha.
  tail -n 20 "$sql" | grep -q 'PostgreSQL database dump complete' ||
    erro "$nome está incompleto (o arquivo foi cortado no meio). Nada foi alterado."
  ok "Cópia conferida"

  passo "3/4 Restaurando (o sistema fica fora do ar por alguns instantes)"
  dc up -d db </dev/null >/dev/null 2>&1
  esperar_banco || erro "O banco não respondeu. Nada foi alterado."
  PAROU_APP=1
  dc stop app </dev/null >/dev/null 2>&1
  # Esquema limpo antes: tabela que a cópia não tem (de uma versão mais nova)
  # não pode sobrar. Tudo numa transação: erro no meio = nada muda.
  if ! { printf 'SET client_min_messages = warning;\nDROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\n'; cat "$sql"; } |
    dc exec -T db psql -X -q -v ON_ERROR_STOP=1 --single-transaction -U hermes -d hermes >/dev/null; then
    erro "A restauração falhou (motivo acima). Nada foi alterado: o banco continua como estava."
  fi
  # Ninguém continua logado com uma sessão que existia na época da cópia.
  dc exec -T db psql -X -q -U hermes -d hermes \
    -c "DO \$\$ BEGIN IF to_regclass('public.sessoes') IS NOT NULL THEN DELETE FROM sessoes; END IF; END \$\$;" </dev/null >/dev/null
  ok "Dados restaurados"

  passo "4/4 Subindo o sistema"
  dc up -d </dev/null >/dev/null 2>&1
  PAROU_APP=0
  esperar_saude 240 || erro "O sistema não respondeu depois da restauração. Veja: sudo docker compose -f $COMPOSE_ARQ logs --tail 50 app"
  ok "Hermes no ar com os dados de $(data_de "$arquivo")."
  info "Todos precisam entrar de novo (as sessões foram encerradas)."
  [ -z "$antes" ] || info "Para desfazer: sudo $0 $(pasta_backups)/$antes"
}

main "$@"
