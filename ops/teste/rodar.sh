#!/usr/bin/env bash
# ==========================================================
# Teste de ponta a ponta dos scripts de ops/ (backup-agora, restaurar,
# atualizar, nuvem) sem mini PC: um container Ubuntu 24.04 com o cliente
# Docker faz o papel do mini PC e comanda o Docker desta máquina.
#
#   bash ops/teste/rodar.sh      (na raiz do repositório; Linux, ou Git Bash no Windows)
#
# Testa o código como está agora, inclusive o que não foi commitado:
#  1. compila a imagem e a põe num registro local (localhost:5055) com duas
#     versões de mentira, v9.9.1 e v9.9.2;
#  2. monta um repositório com essas duas tags (o /opt/hermes do mini PC);
#  3. roda o teste-ops.sh dentro do "mini PC de mentira" e mostra o resultado.
#
# Leva uns 10 minutos. Usa o projeto "hermes-e2e" do compose e as pastas
# /srv/hermes-e2e e /mnt/hermes-e2e-hd do Docker; não encosta no ambiente de
# desenvolvimento. O registro fica de pé para a próxima rodada:
#   docker stop hermes-teste-registro
# O instalar.sh precisa de systemd: esse se ensaia numa VM (docs/ENSAIO-VM.md).
# ==========================================================
set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash: não trocar /srv/... por um caminho do Windows

RAIZ=$(git rev-parse --show-toplevel)
AQUI="$RAIZ/ops/teste"
REGISTRO=localhost:5055
caminho_docker() { if command -v cygpath >/dev/null; then cygpath -m "$1"; else echo "$1"; fi; }

# No Git Bash, o mesmo caminho precisa servir ao bash, ao git e ao Docker: C:/...
TMP=$(caminho_docker "$(mktemp -d)")
trap 'rm -rf "${TMP:?}"' EXIT

echo "==> Imagem do Hermes (código atual) no registro local"
docker ps --format '{{.Names}}' | grep -qx hermes-teste-registro ||
  docker run -d --rm --name hermes-teste-registro -p 127.0.0.1:5055:5000 registry:2 >/dev/null
docker build -q -t "$REGISTRO/hermes:v9.9.1" "$RAIZ" >/dev/null
docker tag "$REGISTRO/hermes:v9.9.1" "$REGISTRO/hermes:v9.9.2"
docker push -q "$REGISTRO/hermes:v9.9.1" >/dev/null
docker push -q "$REGISTRO/hermes:v9.9.2" >/dev/null

echo "==> Repositório com as versões v9.9.1 e v9.9.2"
git clone -q "$RAIZ" "$TMP/trabalho"
git -C "$RAIZ" ls-files -m -o --exclude-standard | while read -r arquivo; do
  [ -e "$RAIZ/$arquivo" ] || continue
  mkdir -p "$TMP/trabalho/$(dirname "$arquivo")"
  cp "$RAIZ/$arquivo" "$TMP/trabalho/$arquivo"
done
(
  cd "$TMP/trabalho"
  git add -A
  git update-index --chmod=+x ops/*.sh
  git -c user.name=teste -c user.email=teste@hermes.local commit -q --allow-empty -m "teste v9.9.1"
  git tag v9.9.1
  git -c user.name=teste -c user.email=teste@hermes.local commit -q --allow-empty -m "teste v9.9.2"
  git tag v9.9.2
)
git clone -q --bare "$TMP/trabalho" "$TMP/bare.git"
cp "$AQUI/teste-ops.sh" "$TMP/"

echo "==> Mini PC de mentira"
docker build -q -t hermes-minipc-falso "$AQUI" >/dev/null
docker run --rm --name hermes-minipc-falso \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /srv/hermes-e2e:/srv/hermes-e2e \
  -v /mnt/hermes-e2e-hd:/mnt/hermes-e2e-hd \
  -v "$(caminho_docker "$TMP"):/e2e" \
  hermes-minipc-falso bash /e2e/teste-ops.sh
