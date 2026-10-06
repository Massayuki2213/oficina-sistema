# "Mini PC de mentira" para testar os scripts de ops/ de ponta a ponta:
# Ubuntu 24.04 (a base do Mint 22) com o cliente Docker, que comanda o Docker
# da máquina pelo socket. Sem systemd: o instalar.sh se testa numa VM.
FROM ubuntu:24.04
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg git openssl rclone util-linux iproute2 \
 && install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc \
 && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" > /etc/apt/sources.list.d/docker.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
 && rm -rf /var/lib/apt/lists/* \
 && git config --global --add safe.directory '*'
# Projeto próprio do compose: nunca encosta nos containers de desenvolvimento.
ENV COMPOSE_PROJECT_NAME=hermes-e2e
