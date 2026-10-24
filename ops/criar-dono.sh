#!/usr/bin/env bash
# ==========================================================
# Hermes — cria o Dono (o primeiro usuário) pelo terminal.
#
#   sudo /opt/hermes/ops/criar-dono.sh
#
# É o primeiro acesso de um servidor na internet: lá, o primeiro acesso
# pela tela fica desligado (PRIMEIRO_ACESSO_WEB=false), senão quem abrisse
# o endereço primeiro viraria dono do sistema. Pergunta o nome da oficina,
# o do Dono, o e-mail (é o login) e a senha, que não aparece na tela nem
# fica no histórico do terminal. Só funciona com o sistema sem nenhum usuário.
# ==========================================================
set -euo pipefail
source "$(dirname "$0")/comum.sh"

endereco() {
  local d
  d=$(ler_env HERMES_DOMINIO)
  case "$d" in '' | :*) echo "http://$(ip_da_rede)" ;; *) echo "https://$d" ;; esac
}

main() {
  precisa_root "$@"
  app_rodando || erro "O Hermes não está no ar. Rode antes: sudo $HERMES_DIR/ops/instalar.sh"

  passo "Criar o Dono (o primeiro usuário do sistema)"
  local oficina nome email senha confirma
  read -r -p "    Nome da oficina: " oficina
  read -r -p "    Nome do Dono: " nome
  read -r -p "    E-mail do Dono (é o login): " email
  read -r -s -p "    Senha (8 caracteres ou mais): " senha
  echo
  read -r -s -p "    Repita a senha: " confirma
  echo
  [ "$senha" = "$confirma" ] || erro "As duas senhas não são iguais. Nada foi criado."

  # A senha vai pela entrada padrão do comando: não aparece na lista de processos.
  printf '%s\n' "$senha" |
    dc exec -T app node dist/criar-dono.js --oficina "$oficina" --nome "$nome" --email "$email" ||
    erro "O Dono não foi criado (motivo acima)."
  ok "Pronto. Entre em $(endereco) com esse e-mail e a senha."
}

main "$@"
