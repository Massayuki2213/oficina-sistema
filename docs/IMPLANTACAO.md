# Hermes — Instalação na oficina

O Hermes roda num **mini PC com Linux Mint** que fica sempre ligado na oficina. Ele é o
servidor e também o computador do balcão. Os outros aparelhos (celular, tablet, notebook)
só abrem o navegador: não se instala nada neles.

Este guia é para quem instala e mantém o sistema. Não precisa ser programador, mas precisa
saber abrir o terminal e copiar comandos. Antes da primeira vez na oficina, vale ensaiar numa
máquina virtual: [ENSAIO-VM.md](ENSAIO-VM.md).

**Onde roda cada comando:** no mini PC, em **Menu → Terminal**, entrando na conta
**`suporte`**. Os comandos com `sudo` pedem a senha dessa conta.

## Como fica

```
┌──────────── Mini PC (Linux Mint, sempre ligado, no nobreak) ────────────┐
│  Docker:  [ banco PostgreSQL ]  ←→  [ Hermes: sistema + tela ]  porta 80 │
│  Backup diário → SSD (14 dias)  +  HD externo USB (60 dias)              │
│  Chrome do balcão: http://localhost                                      │
└──────────────────────────────────────────────────────────────────────────┘
          ▲ rede da oficina (cabo / Wi-Fi)                ▲ Tailscale
   celular, tablet, notebook:                      suporte à distância
   http://<ip-do-mini-pc>                          (sem abrir porta no roteador)
```

- O sistema sobe sozinho quando o mini PC liga, **sem ninguém entrar** no Linux.
- Atualizar o mini PC atualiza todo mundo: os aparelhos só recarregam a página.

## O que comprar

| Item | Para quê | Recomendação |
|---|---|---|
| Mini PC | Servidor e balcão | Intel N100, 16 GB de memória, SSD de 512 GB |
| Nobreak | Segura as quedas curtas de luz | 600 VA; no mini PC e no roteador |
| HD externo USB | Segunda cópia do backup | Qualquer um a partir de 500 GB (as cópias são pequenas) |
| Cabo de rede | Mini PC no roteador | Mais estável que Wi-Fi para o servidor |

## 1. Preparar o mini PC

### Ligar sozinho quando a luz volta (BIOS)

Ligue o mini PC apertando **Del** (em alguns modelos, **F2**) até abrir a BIOS. Procure a opção
que diz o que fazer quando a energia volta. Ela muda de nome conforme o fabricante:

- *Restore on AC Power Loss*
- *AC Power Recovery*
- *Power On After Power Failure*
- *State After G3*

Escolha **Power On** (ou *S0*). Salve e saia (normalmente **F10**).

Sem isso, depois de uma queda de luz longa, o mini PC fica desligado até alguém apertar o
botão, e a oficina inteira fica sem sistema.

### Nobreak

- Mini PC e roteador nas tomadas **com bateria** do nobreak. O monitor pode ir na tomada sem
  bateria.
- O nobreak segura as quedas curtas e os "piscas" de luz, que são as que mais estragam disco.
- Numa queda longa, a bateria acaba e o mini PC desliga sem aviso. O banco aguenta (o
  PostgreSQL se recupera sozinho), e a BIOS liga o mini PC quando a luz volta.

### Rede: IP fixo e Wi-Fi de visitantes

- **IP fixo do mini PC.** Os celulares e o suporte acham o sistema pelo IP. Depois da
  instalação (seção 3), o resumo mostra o IP. No painel do roteador, faça uma **reserva de
  DHCP** para o mini PC com esse IP. O nome varia: "Reserva de endereço", "Vincular IP e MAC",
  "DHCP estático".
- **Wi-Fi de visitantes separada.** Cliente esperando o carro usa a rede **de visitantes**
  ("Rede de convidados" no roteador). Na rede principal só ficam o mini PC e os aparelhos da
  equipe: quem está nela enxerga o sistema. Se o roteador não tiver rede de visitantes, troque
  a senha da Wi-Fi principal e não a passe para clientes.

## 2. Instalar o Linux Mint

### Pendrive de instalação

Num computador com Windows:

1. Baixe o **Linux Mint 22.3 Cinnamon** (64 bits) em <https://linuxmint.com/download.php>.
2. Grave num pendrive de 8 GB ou mais com o **Rufus** (<https://rufus.ie>): escolha o pendrive
   e o arquivo `.iso` e clique em *Iniciar*. **O pendrive é apagado.**

### Instalação

1. Pendrive no mini PC; ligue apertando **F7** (ou **F11**/**Esc**) para escolher o pendrive.
2. Na área de trabalho do Mint, clique duas vezes em **Install Linux Mint**.
3. Idioma **Português do Brasil**, teclado **Português (Brasil)**.
4. **Apagar disco e instalar o Linux Mint.** O SSD do mini PC é todo do Hermes.
5. Fuso: **São Paulo**.
6. Conta de administrador:
   - Seu nome: `Suporte`
   - Nome do computador: `hermes-oficina`
   - Usuário: `suporte`
   - Uma senha forte
   - **Exigir senha para entrar**

   Essa senha fica com quem cuida do sistema, não com a oficina.
7. Reinicie, tire o pendrive e entre como `suporte`.

### A conta do balcão (sem administrador)

Quem usa o balcão entra numa conta que **não instala nada e não mexe no servidor**.

1. Entrando como `suporte`: **Menu → Usuários e grupos** (pede a senha) → **Adicionar**.
2. Tipo de conta: **Padrão**. Nome: `Oficina`, usuário: `oficina`, e uma senha simples que a
   equipe saiba.
3. Não marque nada de administrador, e **não** coloque essa conta no grupo `docker` (quem
   está nele manda no servidor inteiro).

O dia a dia é na conta `oficina`. A conta `suporte` serve só para instalar, atualizar e
resolver problema.

## 3. Instalar o Hermes

**Conecte o HD externo antes.** Depois, no Terminal da conta `suporte`:

```bash
sudo apt install -y git
sudo git clone --branch v1.0.0 https://github.com/Massayuki2213/oficina-sistema.git /opt/hermes
sudo /opt/hermes/ops/instalar.sh
```

O instalador mostra 9 passos e pode rodar de novo quantas vezes quiser: o que já está feito,
ele só confere. Ele faz:

1. Confere o computador e a internet.
2. Acerta o fuso para São Paulo e o relógio pela internet, e desliga a suspensão (o servidor
   nunca dorme).
3. Instala o Docker como serviço que sobe no boot.
4. Cria `/opt/hermes/.env` com senhas aleatórias, só na primeira vez (veja
   [Onde fica cada coisa](#onde-fica-cada-coisa)).
5. Prepara o HD externo. **Pergunta:** ele lista os discos (sem o do sistema). Digite o do HD
   (ex.: `/dev/sdb`) e depois `APAGAR` para formatar. Um HD que já é do Hermes (reinstalação)
   é aproveitado sem formatar.
6. Liga as atualizações de segurança automáticas, sem reiniciar sozinho.
7. Liga o Tailscale. **Pergunta:** aparece um link; abra no navegador e entre com a conta
   Tailscale do suporte (seção 7).
8. Baixa o sistema e sobe.
9. Mostra os endereços:

```
    Nesta máquina:        http://localhost
    Na rede da oficina:   http://192.168.0.50   (reserve este IP no roteador)
    Suporte (Tailscale):  http://100.101.102.103
```

Abra **http://localhost**. A tela de **Primeiro acesso** pede o nome da oficina e cria o
usuário **Dono**. Depois, em **Configurações**, o Dono:

- completa os dados da oficina (CNPJ, telefone, endereço, **logo**, rodapé);
- ajusta as regras (margem, desconto sem senha, validade do orçamento, garantia);
- cadastra a equipe em **Equipe**, cada pessoa com o próprio e-mail e senha.

## 4. O balcão e os outros aparelhos

**Balcão (o próprio mini PC, conta `oficina`):**

- Instale o **Google Chrome** entrando como `suporte`: no Firefox, baixe em
  <https://www.google.com/chrome> o pacote para Debian/Ubuntu e abra com o *Instalador de
  pacotes*.
- Na conta `oficina`, abra o Chrome em **http://localhost** e deixe como página inicial:
  *Configurações → Ao iniciar → Abrir uma página específica*.
- Para o Chrome abrir sozinho ao entrar: **Menu → Aplicativos de inicialização → Adicionar →
  Google Chrome**.
- **Impressora:** **Menu → Impressoras → Adicionar**. A maioria das USB funciona direto. O
  orçamento e a OS saem pela impressão do navegador.
- **Leitor de código de barras USB:** funciona como teclado, sem configurar nada.

**Celular, tablet, notebook:** na Wi-Fi **principal** da oficina, abra
`http://<ip-do-mini-pc>`. No celular, *Adicionar à tela inicial* vira um atalho.

> O navegador mostra **"Não seguro"** ao lado do endereço. É porque a rede interna usa
> `http`, não `https`. Os dados não saem da oficina. HTTPS fica para depois da 1.0.

## 5. Backup — leia esta parte

### Como funciona

- O sistema faz **uma cópia completa do banco por dia**. Ao ligar, se a última tiver mais de
  24 h, faz uma na hora.
- Cada cópia vai para dois lugares: o **SSD** do mini PC (guarda 14 dias) e o **HD externo**
  (guarda 60 dias). Os dois nunca ficam com menos de 3 cópias.
- Em **Configurações → Backup** o Dono vê a situação dos dois lugares, faz uma cópia na hora e
  **baixa** qualquer uma.
- O **painel do Dono avisa** quando a última cópia passa de 24 h, quando o HD externo está
  desconectado e quando a gravação no HD falha.

Pelo terminal: `sudo /opt/hermes/ops/backup-agora.sh`.

### O HD externo

- **Fica sempre conectado** no mini PC. Não use para outras coisas e não formate.
- Desconectou? O painel avisa. Ao conectar de novo, ele é montado em até 5 minutos, e a cópia
  mais nova vai para ele na hora seguinte (ou na hora, com *Fazer backup agora*).
- O instalador o deixa escondido no gerenciador de arquivos, para ninguém "ejetar" sem querer.

### Cópia fora da oficina e a cifra

O HD fica do lado do mini PC: protege de disco queimado, mas não de roubo ou incêndio. Para
isso, uma cópia precisa estar **fora** da oficina. E a cópia leva **tudo** (clientes,
telefones, o caixa): fora da oficina, ela tem que ser **cifrada**.

**Ligar a cifra.** Se houver qualquer chance de uma cópia ou o HD sair da oficina, faça isso
**no dia da instalação**:

```bash
sudo nano /opt/hermes/.env
#   acrescente uma linha:  BACKUP_SENHA=uma-frase-longa-que-so-o-dono-sabe   (12+ caracteres)
#   salve com Ctrl+O, Enter, e saia com Ctrl+X
sudo docker compose -f /opt/hermes/docker-compose.prod.yml up -d
```

- As cópias novas saem como `hermes-...sql.enc`. Em Configurações → Backup aparece "Cópias
  cifradas".
- As cópias **antigas continuam sem cifra** até vencerem (14 dias no SSD, 60 no HD). Por isso,
  ligue a cifra antes de o HD sair.

> **Perdeu a senha, perdeu as cópias.** Não há como abrir sem ela. Guarde-a **fora** do mini
> PC e **longe** do HD: gerenciador de senhas do Dono, ou papel no cofre.

Com a cifra ligada, duas formas de ter a cópia de fora:

- **Pendrive:** o Dono baixa a mais nova em Configurações → Backup, toda semana, e leva para
  casa.
- **Nuvem, automático (opcional):** com o `rclone`, uma vez por dia. Configure o destino
  (Google Drive, OneDrive...) e ligue:

  ```bash
  sudo apt install -y rclone
  sudo rclone config                                   # cria o "remoto", ex.: gdrive
  sudo /opt/hermes/ops/nuvem.sh ativar gdrive:hermes   # liga a cópia diária
  sudo /opt/hermes/ops/nuvem.sh status
  ```

  Só vão cópias cifradas: sem `BACKUP_SENHA`, ele não liga. Na nuvem ficam 90 dias.

### Restaurar uma cópia

> Restaurar **substitui todos os dados** pelos da cópia.

```bash
sudo /opt/hermes/ops/restaurar.sh                          # escolhe numa lista (SSD e HD)
sudo /opt/hermes/ops/restaurar.sh /media/.../hermes-...sql # ou um arquivo de outro lugar (pendrive)
```

O script:

1. Mostra a cópia e pede para digitar `RESTAURAR`.
2. Faz um **backup do estado atual**. É por ele que se desfaz: o fim da restauração mostra o
   comando.
3. Confere a cópia: abre a cifrada (com a senha do `.env`), recusa arquivo que não é backup ou
   que foi cortado no meio.
4. Restaura numa transação só. Se der qualquer erro no meio, o banco fica **exatamente como
   estava**.
5. Encerra as sessões (todo mundo entra de novo) e sobe o sistema.

Cópia de uma versão anterior do Hermes: o sistema atualiza o banco sozinho ao subir.

## 6. Atualizar

### O Hermes

```bash
sudo /opt/hermes/ops/atualizar.sh          # mostra a versão instalada e as disponíveis
sudo /opt/hermes/ops/atualizar.sh v1.0.1   # atualiza
```

O script:

1. Confere que a versão existe.
2. Faz um backup.
3. Baixa a versão nova. Se o download falhar, nada muda.
4. Troca a versão e espera o sistema responder.

**Voltar** é o mesmo comando com a versão anterior, por exemplo
`sudo /opt/hermes/ops/atualizar.sh v1.0.0`. Se os dados ficarem errados depois de voltar, o
script mostra qual cópia restaurar.

Faça fora do horário de atendimento: o sistema fica fora do ar por um ou dois minutos. Depois,
os aparelhos só recarregam a página.

### O Linux

- **Correções de segurança:** instaladas sozinhas todo dia, **sem reiniciar**.
- **Uma vez por mês**, fora do horário:
  1. Abra o **Gerenciador de atualizações** (ícone de escudo no canto da tela), conta
     `suporte`, e aplique o que houver.
  2. Reinicie: `sudo reboot`. O kernel novo só entra depois de reiniciar.

  O Docker também se atualiza por ali; o sistema fica fora do ar enquanto ele reinicia.

## 7. Suporte à distância (Tailscale)

O Tailscale liga o mini PC aos computadores do suporte por uma rede privada, **sem abrir
nenhuma porta no roteador**.

- Conta: a do suporte, em <https://tailscale.com> (gratuita). O instalador pede para entrar
  com ela (seção 3, passo 7).
- No computador do suporte: instale o Tailscale com a mesma conta. Aí o sistema abre em
  `http://hermes-oficina`, e o terminal em `ssh suporte@hermes-oficina`.
- Tirar o acesso: painel do Tailscale (<https://login.tailscale.com/admin/machines>) →
  `hermes-oficina` → *Remove*.
- O Dono quer abrir de casa? Instale o Tailscale no celular dele e compartilhe a máquina
  `hermes-oficina` com ele pelo mesmo painel (*Share*).

> **Nunca** abra a porta 80 do roteador para a internet. A 1.0 não tem HTTPS, e senhas iriam
> abertas pela rede.

## 8. Problemas comuns

| Sintoma | O que fazer |
|---|---|
| Depois de uma queda de luz, nada abre | Espere 2 minutos. O mini PC ligou? Se não, confira a BIOS (seção 1). Ligou e não abre: `sudo docker compose -f /opt/hermes/docker-compose.prod.yml ps` (os dois devem estar *healthy*). |
| Celular não abre o endereço | Está na Wi-Fi **principal** (não na de visitantes)? O IP do mini PC mudou? Faça a reserva de DHCP (seção 1). |
| Painel: "O HD externo não está conectado" | Confira o cabo USB. Depois `sudo /opt/hermes/ops/hd-montar.sh` e `findmnt /mnt/hermes-backup` (deve mostrar o HD). |
| Painel: "Não consegui gravar no HD externo: o HD está cheio" | As cópias são pequenas: alguém pôs outra coisa no HD. Veja com `sudo du -sh /mnt/hermes-backup/*`. |
| Sistema reiniciando sem parar | `sudo docker compose -f /opt/hermes/docker-compose.prod.yml logs --tail 50 app`. A mensagem diz o que falta. |
| Esqueci a senha do Dono | Outro Dono redefine em Configurações → Equipe. Sendo o único Dono: `sudo docker compose -f /opt/hermes/docker-compose.prod.yml exec app node dist/redefinir-senha.js dono@suaoficina.com NovaSenha123` (fica no Histórico). |
| Celular perdido com o sistema aberto | O Dono, em **Configurações → Equipe**, clica em "Desconectar de todos os aparelhos" na pessoa. Cada um também encerra os próprios aparelhos em **Configurações → Minha conta**. |
| Trocar o mini PC | Faça um backup no antigo. No novo, siga as seções 1 a 3 com o **mesmo HD** (o instalador o aproveita sem formatar). Depois `sudo /opt/hermes/ops/restaurar.sh` e escolha a cópia mais nova. Reserve o mesmo IP no roteador. |

Saúde do sistema: `curl http://localhost/api/health` (responde `"status":"ok"`).

## Onde fica cada coisa

| O quê | Onde |
|---|---|
| Sistema (scripts, `docker-compose.prod.yml`) | `/opt/hermes`, parado na versão instalada |
| Senhas e configuração | `/opt/hermes/.env`, só o root lê. **Nunca vai para o git.** Guarde uma cópia fora do mini PC se ligar a cifra. |
| Backups no SSD | `/srv/hermes/backups` |
| Backups no HD externo | `/mnt/hermes-backup`, montado pelo UUID do HD |
| Banco de dados | Volume Docker `hermes_dados` |

| Para | Comando (Terminal, conta `suporte`) |
|---|---|
| Ver se está tudo de pé | `sudo docker compose -f /opt/hermes/docker-compose.prod.yml ps` |
| Ver o log | `sudo docker compose -f /opt/hermes/docker-compose.prod.yml logs --tail 100 app` |
| Backup agora | `sudo /opt/hermes/ops/backup-agora.sh` |
| Restaurar | `sudo /opt/hermes/ops/restaurar.sh` |
| Atualizar ou voltar de versão | `sudo /opt/hermes/ops/atualizar.sh <versão>` |
| Conferir a instalação | `sudo /opt/hermes/ops/instalar.sh` (só confere o que já está feito) |
