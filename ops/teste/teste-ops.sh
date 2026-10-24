#!/usr/bin/env bash
# ==========================================================
# Roda DENTRO do mini PC de mentira (quem chama é o ops/teste/rodar.sh).
# Testa de ponta a ponta:
#  - a porta de entrada (Caddy) e o primeiro acesso de servidor na internet
#    (criar-dono.sh; a tela recusa);
#  - backup-agora;
#  - restaurar: .sql e .sql.enc, da lista, do HD, de um pendrive, cancelado,
#    arquivo que não é backup, cópia cortada, erro no meio, senha errada;
#  - atualizar: sobe, volta, versão inexistente, imagem inexistente;
#  - nuvem: rclone com um "remoto" local.
# ==========================================================
# Cada verificação é um texto avaliado na hora pelo `confere` (eval): as aspas
# simples e as variáveis que "parecem não usadas" são de propósito.
# shellcheck disable=SC2016,SC2034,SC2012,SC2329
set -uo pipefail

FALHAS=0
confere() {
  if eval "$2"; then echo "  [OK] $1"; else echo "  [FALHOU] $1"; FALHAS=$((FALHAS + 1)); fi
}
titulo() { printf '\n\033[1m######## %s\033[0m\n' "$*"; }

BK=/srv/hermes-e2e/backups
HD=/mnt/hermes-e2e-hd
# O clone fica numa pasta que o Docker da máquina também enxerga, no mesmo
# caminho: o Caddy lê o ops/Caddyfile direto do disco.
H=/srv/hermes-e2e/hermes

rm -rf "${H:?}"
git clone -q --branch v9.9.1 /e2e/bare.git $H 2>/dev/null
# shellcheck disable=SC1091
source $H/ops/comum.sh
set +e

cat >$H/.env <<EOF
HERMES_IMAGEM=localhost:5055/hermes
HERMES_VERSAO=v9.9.1
POSTGRES_PASSWORD=$(openssl rand -hex 24)
SESSAO_SEGREDO=$(openssl rand -hex 32)
TZ=America/Sao_Paulo
HERMES_DOMINIO=:80
HERMES_PORT=3398
HERMES_PORTA_HTTPS=3443
PRIMEIRO_ACESSO_WEB=false
HERMES_BACKUPS=$BK
HERMES_HD_EXTERNO=$HD
BACKUP_RETENCAO_DIAS=14
BACKUP_RETENCAO_DIAS_EXTERNO=60
EOF
chmod 600 $H/.env
install -d -o 1000 -g 1000 -m 750 $BK $HD
echo marca >$HD/.hermes-hd-externo
chown 1000:1000 $HD/.hermes-hd-externo

sqlv() { dc exec -T db psql -X -tA -U hermes -d hermes -c "$1" </dev/null; }
api() {
  dc exec -T app node -e "
    const [m, p, b] = process.argv.slice(1);
    fetch('http://127.0.0.1:3333' + p, { method: m, headers: b ? { 'content-type': 'application/json' } : {}, body: b || undefined })
      .then(async (r) => console.log(r.status)).catch((e) => console.log(0, e.message));" "$1" "$2" "${3:-}" </dev/null
}
nome_dono() { sqlv "SELECT nome FROM usuarios WHERE perfil = 'DONO'"; }
login() { api POST /api/auth/login '{"email":"dono@oficina.com","senha":"senha-forte-123"}'; }
arquivo_de() { sed -n 's/.*\(Pronto\|Guardado\): .*\/\(hermes-[^ ]*\)$/\2/p' | tail -n 1; }
no_ar() { app_rodando && esperar_saude 60; }

titulo "Subindo a v9.9.1"
dc up -d </dev/null 2>&1 | tail -n 2
esperar_saude 240 || { dc logs --tail 60 app; exit 1; }
confere "sistema no ar" true
confere "a porta de entrada (Caddy) entrega o sistema" 'dc exec -T caddy wget -qO- http://127.0.0.1/api/health </dev/null | grep -q "\"status\":\"ok\""'
confere "e a tela (index.html)" 'dc exec -T caddy wget -qO- http://127.0.0.1/ </dev/null | grep -q "<div id=\"root\">"'

titulo "Primeiro acesso de servidor na internet"
PRIMEIRO_WEB='{"oficinaNome":"Oficina Robo","nome":"Robo","email":"robo@x.com","senha":"senha-forte-123"}'
confere "pela tela: recusado (403)" '[ "$(api POST /api/auth/primeiro-acesso "$PRIMEIRO_WEB")" = 403 ] && [ "$(sqlv "SELECT count(*) FROM usuarios")" = 0 ]'
SAIDA=$(printf 'Oficina E2E\nDono Antes\ndono@oficina.com\nsenha-forte-123\nsenha-diferente\n' | $H/ops/criar-dono.sh 2>&1)
confere "criar-dono.sh: senhas diferentes, não cria" '[ $? -ne 0 ] && echo "$SAIDA" | grep -q "não são iguais" && [ "$(sqlv "SELECT count(*) FROM usuarios")" = 0 ]'
SAIDA=$(printf 'Oficina E2E\nDono Antes\ndono@oficina.com\nsenha-forte-123\nsenha-forte-123\n' | $H/ops/criar-dono.sh 2>&1); echo "$SAIDA" | tail -n 2 | sed 's/^/    | /'
confere "criar-dono.sh: cria o Dono" '[ "$(sqlv "SELECT perfil FROM usuarios")" = DONO ] && [ "$(login)" = 200 ]'
confere "e não aparece a senha em lugar nenhum da saída" '! echo "$SAIDA" | grep -q "senha-forte-123"'
SAIDA=$(printf 'Outra\nIntruso\nintruso@x.com\nsenha-forte-456\nsenha-forte-456\n' | $H/ops/criar-dono.sh 2>&1)
confere "criar-dono.sh de novo: recusa (já configurado)" '[ $? -ne 0 ] && [ "$(sqlv "SELECT count(*) FROM usuarios")" = 1 ]'

titulo "backup-agora.sh"
SAIDA=$($H/ops/backup-agora.sh 2>&1); echo "$SAIDA" | sed 's/^/    | /'
B1=$(echo "$SAIDA" | arquivo_de)
confere "gera a cópia no SSD ($B1)" '[ -n "$B1" ] && [ -f "$BK/$B1" ]'
confere "e a copia no HD externo" '[ -f "$HD/$B1" ]'
confere "a cópia é um pg_dump completo" 'tail -n 20 "$BK/$B1" | grep -q "dump complete"'

titulo "restaurar.sh: cancelado"
sqlv "UPDATE usuarios SET nome = 'Dono Depois' WHERE perfil = 'DONO'" >/dev/null
confere "login funciona antes" '[ "$(login)" = 200 ]'
echo "nao" | $H/ops/restaurar.sh "$BK/$B1" >/dev/null 2>&1
confere "sem digitar RESTAURAR, sai com erro" '[ $? -ne 0 ]'
confere "e nada muda" '[ "$(nome_dono)" = "Dono Depois" ]'
confere "e o sistema continua no ar" no_ar

titulo "restaurar.sh: arquivo .sql do SSD"
SAIDA=$(printf 'RESTAURAR\n' | $H/ops/restaurar.sh "$BK/$B1" 2>&1); RC=$?; echo "$SAIDA" | sed 's/^/    | /'
ANTES=$(echo "$SAIDA" | arquivo_de)
confere "termina bem" '[ $RC -eq 0 ]'
confere "os dados voltaram (Dono Antes)" '[ "$(nome_dono)" = "Dono Antes" ]'
confere "sessões encerradas" '[ "$(sqlv "SELECT count(*) FROM sessoes")" = 0 ]'
confere "login funciona depois (permissões do hermes_app de volta)" '[ "$(login)" = 200 ]'
confere "o backup de antes guarda o estado anterior (Dono Depois)" '[ -n "$ANTES" ] && grep -q "Dono Depois" $BK/$ANTES'

titulo "restaurar.sh: escolhendo na lista (desfazer)"
SAIDA=$(printf '\nRESTAURAR\n' | $H/ops/restaurar.sh 2>&1); RC=$?; echo "$SAIDA" | sed 's/^/    | /'
confere "lista as cópias do SSD e do HD" 'echo "$SAIDA" | grep -q " SSD " && echo "$SAIDA" | grep -q " HD "'
confere "Enter = a mais nova (a de antes da restauração): desfeito" '[ $RC -eq 0 ] && [ "$(nome_dono)" = "Dono Depois" ]'

titulo "restaurar.sh: cópia do HD e de um pendrive"
mkdir -p /tmp/pendrive && cp "$BK/$B1" /tmp/pendrive/
printf 'RESTAURAR\n' | $H/ops/restaurar.sh "/tmp/pendrive/$B1" >/dev/null 2>&1
confere "de fora das pastas do Hermes" '[ $? -eq 0 ] && [ "$(nome_dono)" = "Dono Antes" ]'
sqlv "UPDATE usuarios SET nome = 'Dono Depois' WHERE perfil = 'DONO'" >/dev/null
printf 'RESTAURAR\n' | $H/ops/restaurar.sh "$HD/$B1" >/dev/null 2>&1
confere "do HD externo" '[ $? -eq 0 ] && [ "$(nome_dono)" = "Dono Antes" ]'

titulo "restaurar.sh: arquivos ruins (nada pode mudar)"
sqlv "UPDATE usuarios SET nome = 'Dono Intocado' WHERE perfil = 'DONO'" >/dev/null
echo "isto nao e um backup" >/tmp/pendrive/hermes-lixo.sql
SAIDA=$(printf 'RESTAURAR\n' | $H/ops/restaurar.sh /tmp/pendrive/hermes-lixo.sql 2>&1)
confere "arquivo que não é backup: recusa" '[ $? -ne 0 ] && echo "$SAIDA" | grep -q "não é um backup"'
head -c $(($(stat -c %s "$BK/$B1") / 2)) "$BK/$B1" >/tmp/pendrive/hermes-cortado.sql
SAIDA=$(printf 'RESTAURAR\n' | $H/ops/restaurar.sh /tmp/pendrive/hermes-cortado.sql 2>&1)
confere "cópia cortada no meio: recusa" '[ $? -ne 0 ] && echo "$SAIDA" | grep -q "incompleto"'
sed '0,/^CREATE TABLE public.usuarios/s//SELECT 1 \/ 0;\nCREATE TABLE public.usuarios/' "$BK/$B1" >/tmp/pendrive/hermes-com-erro.sql
SAIDA=$(printf 'RESTAURAR\n' | $H/ops/restaurar.sh /tmp/pendrive/hermes-com-erro.sql 2>&1); RC=$?; echo "$SAIDA" | tail -n 4 | sed 's/^/    | /'
confere "erro no meio da restauração: sai com erro" '[ $RC -ne 0 ] && echo "$SAIDA" | grep -q "Nada foi alterado"'
confere "e o banco ficou exatamente como estava" '[ "$(nome_dono)" = "Dono Intocado" ]'
confere "e o sistema voltou ao ar sozinho" no_ar
confere "e o login segue funcionando" '[ "$(login)" = 200 ]'

titulo "Backup cifrado (BACKUP_SENHA)"
gravar_env BACKUP_SENHA senha-das-copias-e2e
dc up -d </dev/null >/dev/null 2>&1 && esperar_saude 240
SAIDA=$($H/ops/backup-agora.sh 2>&1); echo "$SAIDA" | sed 's/^/    | /'
B2=$(echo "$SAIDA" | arquivo_de)
confere "sai como .sql.enc ($B2)" '[[ $B2 == *.sql.enc ]] && [ -f "$BK/$B2" ]'
confere "sem nada legível dentro" '! grep -q "Dono Intocado" "$BK/$B2"'
sqlv "UPDATE usuarios SET nome = 'Dono Depois da Cifra' WHERE perfil = 'DONO'" >/dev/null
printf 'RESTAURAR\n' | $H/ops/restaurar.sh "$BK/$B2" >/dev/null 2>&1
confere "restaura a cópia cifrada" '[ $? -eq 0 ] && [ "$(nome_dono)" = "Dono Intocado" ]'
confere "sem deixar o SQL aberto para trás" '[ -z "$(ls -A /var/tmp | grep hermes-restaurar)" ]'
cp "$BK/$B2" /tmp/pendrive/hermes-pendrive.sql.enc
sqlv "UPDATE usuarios SET nome = 'Dono Depois da Cifra' WHERE perfil = 'DONO'" >/dev/null
printf 'RESTAURAR\n' | $H/ops/restaurar.sh /tmp/pendrive/hermes-pendrive.sql.enc >/dev/null 2>&1
confere "cifrada vinda de um pendrive" '[ $? -eq 0 ] && [ "$(nome_dono)" = "Dono Intocado" ] && [ -f $BK/hermes-pendrive.sql.enc ]'
gravar_env BACKUP_SENHA senha-errada-qualquer
dc up -d </dev/null >/dev/null 2>&1 && esperar_saude 240
sqlv "UPDATE usuarios SET nome = 'Dono Senha Errada' WHERE perfil = 'DONO'" >/dev/null
SAIDA=$(printf 'RESTAURAR\n' | $H/ops/restaurar.sh "$BK/$B2" 2>&1); RC=$?; echo "$SAIDA" | tail -n 3 | sed 's/^/    | /'
confere "senha errada: recusa" '[ $RC -ne 0 ] && echo "$SAIDA" | grep -q "Senha errada"'
confere "e nada muda" '[ "$(nome_dono)" = "Dono Senha Errada" ] && no_ar'
gravar_env BACKUP_SENHA senha-das-copias-e2e
dc up -d </dev/null >/dev/null 2>&1 && esperar_saude 240

titulo "nuvem.sh (rclone com remoto local)"
rclone config create teste local >/dev/null
gravar_env NUVEM_DESTINO teste:/tmp/nuvem
SAIDA=$($H/ops/nuvem.sh enviar 2>&1); echo "$SAIDA" | sed 's/^/    | /'
confere "envia as cópias cifradas" '[ -f /tmp/nuvem/$B2 ]'
confere "e nenhuma em SQL puro" '[ -z "$(ls /tmp/nuvem | grep "\.sql$")" ]'
gravar_env BACKUP_SENHA ''
SAIDA=$($H/ops/nuvem.sh enviar 2>&1)
confere "sem BACKUP_SENHA, recusa" '[ $? -ne 0 ] && echo "$SAIDA" | grep -q "precisa ser cifrada"'
gravar_env BACKUP_SENHA senha-das-copias-e2e

titulo "atualizar.sh"
SAIDA=$($H/ops/atualizar.sh 2>&1); echo "$SAIDA" | sed 's/^/    | /'
confere "sem versão: mostra a atual e as disponíveis" 'echo "$SAIDA" | grep -q "instalada: v9.9.1" && echo "$SAIDA" | grep -q v9.9.2'
SAIDA=$($H/ops/atualizar.sh v9.9.9 2>&1)
confere "versão que não existe: recusa" '[ $? -ne 0 ] && echo "$SAIDA" | grep -q "não existe"'
confere "e nada muda" '[ "$(ler_env HERMES_VERSAO)" = v9.9.1 ] && [ "$(git -C $H describe --tags)" = v9.9.1 ]'
git -C /e2e/bare.git tag -f v9.9.3 v9.9.2 >/dev/null
SAIDA=$($H/ops/atualizar.sh v9.9.3 2>&1); RC=$?; echo "$SAIDA" | tail -n 3 | sed 's/^/    | /'
confere "imagem que não existe: recusa" '[ $RC -ne 0 ] && echo "$SAIDA" | grep -q "Não consegui baixar"'
confere "e volta os arquivos e o .env" '[ "$(ler_env HERMES_VERSAO)" = v9.9.1 ] && [ "$(git -C $H describe --tags)" = v9.9.1 ] && no_ar'
git -C /e2e/bare.git tag -d v9.9.3 >/dev/null
N_ANTES=$(ls $BK | wc -l)
SAIDA=$($H/ops/atualizar.sh v9.9.2 2>&1); RC=$?; echo "$SAIDA" | sed 's/^/    | /'
confere "atualiza para a v9.9.2" '[ $RC -eq 0 ] && [ "$(ler_env HERMES_VERSAO)" = v9.9.2 ] && [ "$(ler_env HERMES_VERSAO_ANTERIOR)" = v9.9.1 ]'
confere "arquivos na v9.9.2" '[ "$(git -C $H describe --tags)" = v9.9.2 ]'
confere "container com a imagem v9.9.2" '[ "$(docker inspect --format "{{.Config.Image}}" $(dc ps -q app))" = localhost:5055/hermes:v9.9.2 ]'
confere "fez um backup antes" '[ $(ls $BK | wc -l) -gt $N_ANTES ]'
confere "dados intactos" '[ "$(nome_dono)" = "Dono Senha Errada" ] && [ "$(login)" = 200 ]'
SAIDA=$($H/ops/atualizar.sh v9.9.1 2>&1); RC=$?
confere "volta para a v9.9.1 pelo mesmo caminho" '[ $RC -eq 0 ] && [ "$(ler_env HERMES_VERSAO)" = v9.9.1 ] && no_ar'

titulo "Faxina"
dc down -v </dev/null >/dev/null 2>&1
rm -rf "${BK:?}" "${HD:?}" "${H:?}"
docker volume ls --format '{{.Name}}' | grep -q '^hermes-e2e_' && echo "  sobrou volume" || echo "  ok"

echo
if [ $FALHAS -eq 0 ]; then echo "TUDO CERTO"; else echo "FALHAS: $FALHAS"; fi
exit $FALHAS
