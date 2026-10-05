#!/usr/bin/env bash
# ==========================================================
# Hermes — instala o servidor no mini PC (Linux Mint 22). Pode rodar de
# novo quantas vezes quiser: o que já está feito, ele só confere.
#
#   sudo apt install -y git
#   sudo git clone --branch v1.0.0 https://github.com/Massayuki2213/oficina-sistema.git /opt/hermes
#   sudo /opt/hermes/ops/instalar.sh
#
# Opções:
#   --versao v1.0.0   versão da imagem (padrão: a versão do clone, git checkout)
#   --sem-hd          sem HD externo de backup (o sistema não cobra o HD)
#   --sem-tailscale   sem o suporte à distância
#
# O que faz:
#   1. confere o computador (Mint/Ubuntu 24.04, 64 bits, internet);
#   2. fuso de São Paulo, relógio pela internet, nunca suspender;
#   3. instala o Docker (serviço que sobe no boot);
#   4. cria as pastas e o .env com senhas aleatórias (só na primeira vez);
#   5. HD externo: formata (só com confirmação), monta pelo UUID e cria o
#      arquivo-marca; um timer remonta o HD se ele for plugado depois;
#   6. atualizações de segurança automáticas, sem reiniciar sozinho;
#   7. Tailscale (pede para entrar na conta pelo navegador);
#   8. baixa a imagem e sobe o Hermes;
#   9. mostra o endereço para o primeiro acesso.
# ==========================================================
set -euo pipefail
source "$(dirname "$0")/comum.sh"

VERSAO=''
SEM_HD=0
SEM_TAILSCALE=0
UBUNTU_CODENAME=''

ler_opcoes() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --versao) VERSAO=${2:-}; shift 2 ;;
      --sem-hd) SEM_HD=1; shift ;;
      --sem-tailscale) SEM_TAILSCALE=1; shift ;;
      *) erro "Opção desconhecida: $1 (veja o começo de $0)" ;;
    esac
  done
}

apt_instalar() {
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q "$@" >/dev/null
}

# ---- 1 -----------------------------------------------------------------------------
conferir_computador() {
  passo "1/9 Conferindo o computador"
  [ -r /etc/os-release ] || erro "Não reconheci o sistema (sem /etc/os-release)."
  # shellcheck disable=SC1091
  UBUNTU_CODENAME=$(. /etc/os-release && echo "${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}")
  [ "$UBUNTU_CODENAME" = noble ] ||
    aviso "Feito para o Linux Mint 22 (base Ubuntu 24.04 'noble'); este é '$UBUNTU_CODENAME'. Seguindo mesmo assim."
  [ "$(uname -m)" = x86_64 ] || erro "Precisa de um computador 64 bits (x86_64); este é $(uname -m)."
  apt-get update -q >/dev/null || erro "Sem internet (o apt não conseguiu atualizar a lista de pacotes)."
  apt_instalar ca-certificates curl git openssl
  curl -fsS -m 10 -o /dev/null https://download.docker.com || erro "Sem acesso a download.docker.com (internet ou firewall)."

  if [ -z "$VERSAO" ]; then
    VERSAO=$(git -C "$HERMES_DIR" describe --tags --exact-match 2>/dev/null || true)
  fi
  [ -n "$VERSAO" ] || VERSAO=$(ler_env HERMES_VERSAO)
  [ -n "$VERSAO" ] ||
    erro "Não sei qual versão instalar. Use um clone de uma versão (git checkout v1.0.0) ou passe --versao v1.0.0."
  # shellcheck disable=SC1091
  ok "$(. /etc/os-release && echo "$PRETTY_NAME"), versão do Hermes: $VERSAO"
}

# ---- 2 -----------------------------------------------------------------------------
relogio_e_energia() {
  passo "2/9 Fuso horário e energia"
  timedatectl set-timezone America/Sao_Paulo
  timedatectl set-ntp true 2>/dev/null || aviso "Não consegui ligar o acerto do relógio pela internet."
  ok "Fuso America/Sao_Paulo, relógio pela internet"
  # Servidor não dorme: suspender derrubaria o sistema da oficina inteira.
  systemctl mask --quiet sleep.target suspend.target hibernate.target hybrid-sleep.target
  ok "Suspender e hibernar desligados"
}

# ---- 3 -----------------------------------------------------------------------------
instalar_docker() {
  passo "3/9 Docker"
  if docker compose version >/dev/null 2>&1; then
    ok "Já instalado: $(docker --version)"
  else
    # Pacotes antigos/alternativos brigam com o Docker oficial.
    local p
    for p in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
      if dpkg -s "$p" >/dev/null 2>&1; then apt-get remove -y -q "$p" >/dev/null; fi
    done
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $UBUNTU_CODENAME stable" \
      >/etc/apt/sources.list.d/docker.list
    apt-get update -q >/dev/null
    apt_instalar docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    ok "Instalado: $(docker --version)"
  fi
  systemctl enable --now --quiet containerd docker
  ok "Docker sobe sozinho quando o computador liga"
}

# ---- 4 -----------------------------------------------------------------------------
pastas_e_env() {
  passo "4/9 Pastas e senhas"
  if [ -f "$ENV_ARQ" ]; then
    # Nunca gera senha nova por cima: o banco já foi criado com a antiga.
    gravar_env HERMES_VERSAO "$VERSAO"
    ok ".env já existia: senhas mantidas, versão $VERSAO"
  else
    (
      umask 077
      cat >"$ENV_ARQ" <<EOF
# Hermes — configuração deste mini PC. Criado pelo ops/instalar.sh em $(date '+%d/%m/%Y %H:%M').
# Versão do sistema: troque com sudo $HERMES_DIR/ops/atualizar.sh <versão>
HERMES_VERSAO=$VERSAO
# Senhas sorteadas na instalação. Não mude depois que o banco existir.
POSTGRES_PASSWORD=$(openssl rand -hex 24)
SESSAO_SEGREDO=$(openssl rand -hex 32)
TZ=America/Sao_Paulo
HERMES_PORT=80
HERMES_BACKUPS=/srv/hermes/backups
HERMES_HD_EXTERNO=/mnt/hermes-backup
BACKUP_RETENCAO_DIAS=14
BACKUP_RETENCAO_DIAS_EXTERNO=60
# Cifra das cópias. OBRIGATÓRIA se o HD externo ou as cópias saírem da oficina.
# PERDEU A SENHA, PERDEU AS CÓPIAS: guarde-a fora deste computador.
# Depois de mudar: sudo docker compose -f $COMPOSE_ARQ up -d
# BACKUP_SENHA=
EOF
    )
    ok ".env criado com senhas aleatórias"
  fi
  chown root:root "$ENV_ARQ"
  chmod 600 "$ENV_ARQ"

  local bk
  bk=$(pasta_backups)
  install -d -o "$UID_APP" -g "$UID_APP" -m 750 "$bk"
  ok "Backups no SSD: $bk"
}

# ---- 5 -----------------------------------------------------------------------------
instalar_timer_hd() {
  cat >/etc/systemd/system/hermes-hd.service <<EOF
[Unit]
Description=Hermes: monta o HD externo de backup se ele estiver conectado

[Service]
Type=oneshot
ExecStart=$HERMES_DIR/ops/hd-montar.sh
EOF
  cat >/etc/systemd/system/hermes-hd.timer <<EOF
[Unit]
Description=Hermes: confere o HD externo de backup a cada 5 minutos

[Timer]
OnBootSec=1min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now --quiet hermes-hd.timer
}

# Raiz do HD: arquivo-marca (prova de que é o HD, e não a pasta vazia do
# SSD) e dono = usuário da imagem, para o sistema gravar.
preparar_raiz_hd() {
  local ponto=$1
  [ -f "$ponto/$MARCA_HD" ] || printf 'HD de backup do Hermes. Não apague este arquivo.\n' >"$ponto/$MARCA_HD"
  chown "$UID_APP:$UID_APP" "$ponto"
  chmod 750 "$ponto"
}

# Discos inteiros que podem ser o HD de backup: todos, menos os que guardam
# o sistema (/, /boot, /boot/efi, swap), CD e dispositivos de loop.
discos_candidatos() {
  local sistema='' m origem
  for m in / /boot /boot/efi; do
    origem=$(findmnt -no SOURCE "$m" 2>/dev/null) || continue
    sistema+=$(lsblk -lnspo NAME,TYPE "${origem%%[*}" 2>/dev/null | awk '$2 == "disk" {print $1}')$'\n'
  done
  while read -r origem; do
    sistema+=$(lsblk -lnspo NAME,TYPE "$origem" 2>/dev/null | awk '$2 == "disk" {print $1}')$'\n'
  done < <(swapon --noheadings --show=NAME 2>/dev/null)
  lsblk -dpno NAME,SIZE,TRAN,MODEL -e 7,11 | while read -r nome resto; do
    grep -qxF "$nome" <<<"$sistema" || echo "$nome $resto"
  done
}

# nofail: sem o HD, o computador liga normalmente. x-gvfs-hide: o HD não
# aparece no gerenciador de arquivos (e ninguém o "ejeta" sem querer).
registrar_no_fstab() {
  {
    echo "# HD externo de backup do Hermes (ops/instalar.sh)"
    echo "UUID=$1 $2 ext4 defaults,nofail,noatime,x-systemd.device-timeout=10s,x-gvfs-hide 0 2"
  } >>/etc/fstab
  systemctl daemon-reload
}

configurar_hd() {
  passo "5/9 HD externo de backup"
  local ponto
  ponto=$(ponto_hd)

  if [ "$SEM_HD" = 1 ]; then
    gravar_env BACKUP_DIR_EXTERNO ''
    aviso "Sem HD externo (--sem-hd): as cópias ficam só no SSD."
    return
  fi
  # Rodou de novo depois de um --sem-hd: volta a usar o HD.
  sed -i '/^BACKUP_DIR_EXTERNO=$/d' "$ENV_ARQ"
  mkdir -p "$ponto"

  if grep -qs "^[^#].*[[:space:]]${ponto}[[:space:]]" /etc/fstab; then
    instalar_timer_hd
    if mountpoint -q "$ponto" || mount "$ponto" 2>/dev/null; then
      preparar_raiz_hd "$ponto"
      ok "HD já configurado e montado em $ponto ($(df -h --output=avail "$ponto" | tail -n 1 | tr -d ' ') livres)"
    else
      aviso "HD configurado, mas não está conectado agora. Ao conectar, ele é montado em até 5 minutos."
    fi
    return
  fi

  local discos
  discos=$(discos_candidatos)
  if [ -z "$discos" ]; then
    aviso "Nenhum HD além do disco do sistema. Conecte o HD externo e rode o instalar.sh de novo."
    info "Até lá, o painel do Dono avisa que o HD não está conectado."
    return
  fi

  echo "    Discos encontrados (o do sistema não aparece):"
  echo "$discos" | sed 's/^/      /'
  local disco
  read -r -p "    Qual é o HD de backup? (ex.: /dev/sdb; Enter = pular) " disco || disco=''
  if [ -z "$disco" ]; then
    aviso "HD pulado. Rode o instalar.sh de novo quando quiser configurar."
    return
  fi
  echo "$discos" | awk '{print $1}' | grep -qx "$disco" || erro "$disco não está na lista."

  # Partições do disco desmontadas (o Mint monta sozinho o HD que é plugado).
  local p
  for p in $(lsblk -lnpo NAME "$disco" | tail -n +2); do umount "$p" 2>/dev/null || true; done

  # Já é um HD do Hermes (reinstalação)? Então só aproveita, sem formatar.
  local particao='' uuid=''
  for p in $(lsblk -lnpo NAME,FSTYPE "$disco" | awk '$2 == "ext4" {print $1}'); do
    local tmp
    tmp=$(mktemp -d)
    if mount -o ro "$p" "$tmp" 2>/dev/null; then
      [ -f "$tmp/$MARCA_HD" ] && particao=$p
      umount "$tmp"
    fi
    rmdir "$tmp"
    [ -z "$particao" ] || break
  done

  if [ -n "$particao" ]; then
    uuid=$(blkid -s UUID -o value "$particao")
    registrar_no_fstab "$uuid" "$ponto"
    ok "$particao já é um HD de backup do Hermes: aproveitando, sem formatar"
  else
    aviso "TUDO o que está em $disco será APAGADO: $(lsblk -dno SIZE,MODEL "$disco" | xargs)"
    local confirma
    read -r -p "    Para formatar, digite APAGAR: " confirma || confirma=''
    [ "$confirma" = APAGAR ] || {
      aviso "Não formatei. Rode o instalar.sh de novo quando quiser configurar o HD."
      return
    }
    # UUID escolhido antes: a linha do fstab entra antes do disco novo
    # aparecer, e o Mint não tenta montá-lo em outro lugar.
    uuid=$(cat /proc/sys/kernel/random/uuid)
    registrar_no_fstab "$uuid" "$ponto"
    wipefs -a -q "$disco"
    printf 'label: gpt\n,,L\n' | sfdisk -q "$disco"
    udevadm settle
    particao=$(lsblk -lnpo NAME,TYPE "$disco" | awk '$2 == "part" {print $1; exit}')
    [ -n "$particao" ] || erro "Não achei a partição nova em $disco."
    mkfs.ext4 -q -F -L HERMES-BKP -U "$uuid" "$particao"
    udevadm settle
    ok "$disco formatado (ext4, etiqueta HERMES-BKP)"
  fi

  mount "$ponto"
  preparar_raiz_hd "$ponto"
  instalar_timer_hd
  ok "HD montado em $ponto pelo UUID ($(df -h --output=avail "$ponto" | tail -n 1 | tr -d ' ') livres)"
  info "Se este HD for guardado fora da oficina, ligue a cifra (BACKUP_SENHA no $ENV_ARQ)."
}

# ---- 6 -----------------------------------------------------------------------------
atualizacoes_de_seguranca() {
  passo "6/9 Atualizações de segurança automáticas"
  apt_instalar unattended-upgrades
  # O Mint se apresenta com outro nome: a origem de segurança do Ubuntu vai escrita por extenso.
  cat >/etc/apt/apt.conf.d/52hermes-atualizacoes <<EOF
// Hermes (ops/instalar.sh): só correções de SEGURANÇA, todo dia, sem reiniciar sozinho.
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
Unattended-Upgrade::Origins-Pattern {
        "origin=Ubuntu,archive=$UBUNTU_CODENAME-security";
};
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
EOF
  systemctl unmask --quiet apt-daily.timer apt-daily-upgrade.timer 2>/dev/null || true
  systemctl enable --now --quiet apt-daily.timer apt-daily-upgrade.timer
  ok "Ligadas (sem reinício automático: o kernel novo entra quando o PC for reiniciado)"
}

# ---- 7 -----------------------------------------------------------------------------
configurar_tailscale() {
  passo "7/9 Tailscale (suporte à distância)"
  if [ "$SEM_TAILSCALE" = 1 ]; then
    aviso "Pulado (--sem-tailscale)."
    return
  fi
  if ! command -v tailscale >/dev/null; then
    curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/$UBUNTU_CODENAME.noarmor.gpg" -o /usr/share/keyrings/tailscale-archive-keyring.gpg
    curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/$UBUNTU_CODENAME.tailscale-keyring.list" -o /etc/apt/sources.list.d/tailscale.list
    apt-get update -q >/dev/null
    apt_instalar tailscale
  fi
  systemctl enable --now --quiet tailscaled
  if tailscale status >/dev/null 2>&1; then
    ok "Já conectado: $(tailscale ip -4 2>/dev/null | head -n 1)"
  else
    info "Vai aparecer um link: abra no navegador e entre com a conta Tailscale do suporte."
    # --ssh: o suporte entra por SSH pelo Tailscale, sem abrir porta nenhuma na rede.
    tailscale up --ssh --hostname=hermes-oficina
    ok "Conectado: $(tailscale ip -4 2>/dev/null | head -n 1)"
  fi
  tailscale set --auto-update 2>/dev/null || aviso "Não consegui ligar a atualização automática do Tailscale."
}

# ---- 8 -----------------------------------------------------------------------------
subir_hermes() {
  passo "8/9 Baixando e subindo o Hermes $VERSAO"
  if ! dc pull </dev/null; then
    erro "Não consegui baixar a imagem $VERSAO. Confira a versão e se o pacote no GitHub está público."
  fi
  dc up -d --remove-orphans </dev/null
  esperar_saude 240 || {
    dc logs --tail 40 app </dev/null || true
    erro "O Hermes não respondeu (log acima)."
  }
  ok "No ar"
  local porta
  porta=$(ler_env HERMES_PORT)
  curl -fsS -m 5 -o /dev/null "http://127.0.0.1:${porta:-80}/api/health" ||
    aviso "O sistema está no ar, mas não respondeu em http://127.0.0.1:${porta:-80} (porta ocupada?)."
}

# ---- 9 -----------------------------------------------------------------------------
resumo() {
  passo "9/9 Pronto"
  local ip ts
  ip=$(ip_da_rede)
  ts=$(tailscale ip -4 2>/dev/null | head -n 1 || true)
  info "Nesta máquina:        http://localhost"
  [ -z "$ip" ] || info "Na rede da oficina:   http://$ip   (reserve este IP no roteador)"
  [ -z "$ts" ] || info "Suporte (Tailscale):  http://$ts"
  info ""
  info "Primeiro acesso: abra o endereço e crie o usuário Dono."
  info "Backups: $(pasta_backups) e, com o HD conectado, $(ponto_hd)."
  info "Atualizar: sudo $HERMES_DIR/ops/atualizar.sh <versão>"
}

main() {
  precisa_root "$@"
  ler_opcoes "$@"
  conferir_computador
  relogio_e_energia
  instalar_docker
  pastas_e_env
  configurar_hd
  atualizacoes_de_seguranca
  configurar_tailscale
  subir_hermes
  resumo
}

main "$@"
