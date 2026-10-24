# 0012 — Mini PC com Linux Mint; acesso só pelo navegador

**Situação:** aceita (v1.0). Substitui a parte da [0004](0004-api-serve-a-tela-e-desktop-e-janela.md)
sobre o app de desktop. O mini PC foi substituído por um servidor na nuvem: [0013](0013-servidor-na-nuvem.md).

## Contexto

A oficina não tem TI. O plano anterior usava um PC da própria oficina com Windows e Docker
Desktop, e um app Electron em cada computador. Isso exigia:

- login automático no Windows, porque o Docker Desktop só sobe depois que alguém entra;
- cuidado com o Windows Update reiniciando no meio do expediente;
- um instalador para manter em cada máquina.

## Decisão

- **Servidor dedicado:** um mini PC (Intel N100, 16 GB, SSD 512 GB) com **Linux Mint 22**, base
  Ubuntu 24.04. É também o computador do balcão (Chrome em `http://localhost`).
- **Docker Engine como serviço do systemd:** o sistema sobe com o computador, sem ninguém
  entrar. A BIOS liga o mini PC quando a luz volta, e o nobreak segura as quedas curtas.
- **Só navegador:** balcão, celulares e tablets abrem o mesmo endereço. O app Electron fica
  **congelado** no repositório: sem testes, sem empacotamento, fora dos documentos de
  entrega. Porta **80** no mini PC (`http://<ip>`).
- **Distribuição por versão:**
  - o CI publica `ghcr.io/massayuki2213/oficina-sistema:<tag>` (pública) a cada tag `v*`;
  - `/opt/hermes` é um clone do repositório parado na tag, então scripts, compose e imagem
    andam juntos;
  - `ops/atualizar.sh <versão>` atualiza, e voltar é o mesmo comando com a versão anterior.
- **Backup em dois lugares:** SSD (14 dias) e **HD externo USB** (60 dias):
  - o HD é ext4, montado pelo UUID com `nofail`, e tem um **arquivo-marca**, para não gravar
    na pasta vazia quando o HD não está;
  - o painel do Dono avisa quando o backup atrasa ou o HD sai;
  - a cifra (`BACKUP_SENHA`) é obrigatória se o HD ou as cópias saírem da oficina;
  - a cópia na nuvem (rclone) é opcional e só manda cópias cifradas.
- **Suporte pelo Tailscale**, com SSH pelo próprio Tailscale. Nenhuma porta é aberta no
  roteador.
- **Sistema operacional:**
  - atualizações de segurança automáticas, **sem reiniciar sozinho**;
  - o balcão usa uma conta **sem sudo** e fora do grupo `docker`;
  - suspensão desligada.

## Consequências

- Volta sozinho depois de queda de luz, sem login automático e sem depender de ninguém.
- Nada para instalar nem atualizar nos aparelhos. Atualizar e voltar de versão é um comando.
- O mini PC é um ponto único. Mitigação: backup em dois lugares, restauração testada de ponta
  a ponta (`ops/restaurar.sh`, numa transação só) e reinstalação que aproveita o mesmo HD.
- Rede interna em `http`: o navegador mostra "Não seguro". A porta 80 nunca vai para a
  internet; HTTPS fica para depois da 1.0.
- Quem dá suporte precisa de Linux básico; os scripts de `ops/` e o
  [manual](../IMPLANTACAO.md) cobrem o dia a dia.
