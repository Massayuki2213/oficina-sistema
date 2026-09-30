# Hermes — Instalação na oficina

Guia para quem vai instalar e manter o Hermes funcionando. Não precisa ser programador,
mas precisa saber abrir o terminal e copiar comandos.

## Como o Hermes roda

```
┌──────────────── Computador servidor (fica ligado) ────────────────┐
│  Docker:  [ banco PostgreSQL ]  ←→  [ Hermes: API + tela ]  :3333  │
│           backup automático diário (pg_dump)                      │
└───────────────────────────────────────────────────────────────────┘
        ▲                    ▲                      ▲
   App Hermes (PC       navegador (tablet      navegador
   do balcão)           na oficina)            do escritório
```

- **Um computador é o servidor**: guarda o banco e serve o sistema na porta `3333`.
  Pode ser o PC do escritório (Windows com Docker Desktop) ou um mini-PC com Linux.
- **Os outros aparelhos só abrem o sistema**: pelo app Hermes (Windows) ou pelo navegador,
  em `http://<ip-do-servidor>:3333`. Nada é instalado neles além do app.
- Atualizar o servidor atualiza todo mundo.

## 1. Preparar o servidor

1. Instale o **Docker Desktop** (Windows) ou **Docker Engine** (Linux).
   No Windows, marque em *Settings → General* a opção **Start Docker Desktop when you sign in**.
2. Deixe o IP do servidor **fixo** (reserva de DHCP no roteador). Os outros PCs vão
   apontar para ele.
3. Libere a porta 3333 no firewall do servidor. No Windows (PowerShell como administrador):

   ```powershell
   netsh advfirewall firewall add rule name="Hermes" dir=in action=allow protocol=TCP localport=3333
   ```

4. Copie a pasta do projeto para o servidor (ou `git clone`).

## 2. Configurar

Na pasta do projeto, crie um arquivo **`.env`** com:

```ini
# Senha do banco — invente uma forte, cole depois do "=" e guarde em lugar seguro.
POSTGRES_PASSWORD=

# Chave das sessões — gere com  openssl rand -hex 32  e cole depois do "="
# (sem openssl: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
SESSAO_SEGREDO=

# Opcionais
# SESSAO_DURACAO=12h          # tempo sem uso até pedir login de novo (30m, 12h, 2d)
# BACKUP_SENHA=               # cifra as cópias de backup — leia "Backup cifrado" (seção 5)
# HERMES_PORT=3333            # porta no servidor
# TZ=America/Sao_Paulo        # fuso da oficina
# BACKUP_RETENCAO_DIAS=14     # quantos dias de cópias guardar
```

> Com qualquer um dos dois em branco, o Docker nem começa (e diz qual falta). O sistema
> também **se recusa a subir** com a chave de exemplo do `.env.example` ou com menos de
> 32 caracteres. É de propósito.

A `POSTGRES_PASSWORD` é a do **dono do banco**, usada só para criar e atualizar as tabelas.
O sistema em si conecta com um segundo usuário, `hermes_app`, que só lê e grava dados — ele é
criado sozinho na partida, com uma senha nova a cada vez. Não há nada a configurar.

## 3. Subir

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Na primeira vez demora alguns minutos (monta a imagem). Depois:

- `docker compose -f docker-compose.prod.yml ps` — os dois serviços devem aparecer como *healthy*;
- abra **http://localhost:3333** no próprio servidor.

Na primeira abertura aparece o **Primeiro acesso**: nome da oficina e o usuário **Dono**.
Depois, em **Configurações**, o Dono:

- completa os dados da oficina (CNPJ, telefone, endereço, **logo**, texto do rodapé);
- ajusta as regras (margem padrão, desconto sem senha, validade do orçamento, garantia);
- cadastra a equipe em **Equipe** (cada pessoa com o próprio e-mail e senha).

Os containers voltam sozinhos quando o computador reinicia (`restart: unless-stopped`).

## 4. Instalar o app nos outros PCs

1. Gere o instalador (numa máquina de desenvolvimento, ver [DESENVOLVIMENTO.md](DESENVOLVIMENTO.md#app-de-desktop))
   ou use o `Hermes Setup 1.0.0.exe` já gerado.
2. Instale em cada PC. Na primeira abertura, informe o endereço do servidor — por exemplo
   `192.168.0.10:3333` (descubra o IP no servidor com `ipconfig`).
3. Pronto. Para trocar de servidor depois: menu **Hermes → Trocar servidor...**

Tablet ou celular: é só abrir o endereço no navegador.

## 5. Backup — leia esta parte

O Hermes faz **uma cópia completa do banco por dia** (e ao ligar, se a última tiver mais de
24 h), guardando as dos últimos 14 dias. Em **Configurações → Backup** o Dono vê a situação,
faz uma cópia na hora e **baixa** qualquer uma delas.

**Uma cópia que só existe no mesmo computador não protege de roubo, incêndio ou HD queimado.**
Toda semana, baixe o backup mais recente para um pendrive ou para a nuvem (Google Drive,
OneDrive...).

Para copiar todas as cópias de uma vez, direto do servidor:

```bash
docker compose -f docker-compose.prod.yml cp app:/app/backups ./copias-hermes
```

### Restaurar uma cópia

> Restaurar **substitui tudo** que está no banco pelo conteúdo da cópia. Faça um backup
> do estado atual antes, por garantia.

```bash
# 1. para o sistema (o banco continua de pé)
docker compose -f docker-compose.prod.yml stop app

# 2. manda o arquivo para dentro do container do banco e restaura
docker compose -f docker-compose.prod.yml cp ./hermes-2026-09-30_093635.sql db:/tmp/restaurar.sql
docker compose -f docker-compose.prod.yml exec db psql -U hermes -d hermes -v ON_ERROR_STOP=1 -f /tmp/restaurar.sql

# 3. sobe o sistema de novo (ele aplica migrações pendentes, se a cópia for de uma versão anterior)
docker compose -f docker-compose.prod.yml start app
```

> No Windows, rode esses comandos no **PowerShell**. (No Git Bash, prefixe com
> `MSYS_NO_PATHCONV=1`, senão ele troca o `/tmp/...` por um caminho do Windows.)

As cópias são SQL puro (`pg_dump --clean --if-exists`): também servem para levar os dados
para outro servidor PostgreSQL 16.

### Backup cifrado (recomendado se a cópia sai da oficina)

A cópia leva **tudo**: clientes, telefones, o caixa. Quem achar o pendrive lê. Para cifrar,
ponha no `.env` uma senha de 12+ caracteres e reinicie (`up -d`):

```ini
BACKUP_SENHA=uma-frase-longa-que-so-o-dono-sabe
```

As cópias novas saem como `hermes-...sql.enc` (AES-256). Em **Configurações → Backup**
aparece "Cópias cifradas".

> **Perdeu a senha, perdeu as cópias.** Não há como abrir sem ela. Guarde-a **fora** do
> servidor e **longe** do pendrive (gerenciador de senhas do Dono, papel no cofre).

Para restaurar uma cópia cifrada, abra-a primeiro (o container já tem a senha) e siga o
passo 2 acima com o `.sql` gerado:

```bash
docker compose -f docker-compose.prod.yml exec -T app node dist/abrir-backup.js /app/backups/hermes-2026-09-30_093635.sql.enc > hermes-2026-09-30_093635.sql
```

Cópia baixada que está fora do servidor: copie-a para dentro (`docker compose ... cp
arquivo.sql.enc app:/tmp/`) e use o mesmo comando apontando para `/tmp/arquivo.sql.enc`.
Senha errada ou arquivo corrompido: o comando avisa e não gera nada.

## 6. Atualizar para uma versão nova

```bash
# 1. backup na hora (Configurações → Backup → Fazer backup agora) e baixe a cópia
# 2. pegue a versão nova do código
git pull
# 3. reconstrua e suba — as migrações do banco rodam sozinhas na partida
docker compose -f docker-compose.prod.yml up -d --build
```

Os usuários só precisam recarregar a tela (no app: **Ctrl+R**).

## 7. Acesso de fora da oficina (opcional)

O jeito mais seguro de o Dono acessar de casa é uma **VPN** simples (ex.: Tailscale) entre o
celular/notebook e o servidor — **sem abrir porta no roteador**.

Se for publicar na internet mesmo, coloque um proxy com HTTPS na frente (Caddy, Nginx,
Cloudflare Tunnel) e ajuste no `.env`:

```ini
TRUST_PROXY=true      # o proxy informa o IP real e o HTTPS
COOKIE_SECURE=true    # o cookie de sessão só trafega por HTTPS
```

## 8. Problemas comuns

| Sintoma | O que fazer |
|---|---|
| App mostra "Não foi possível conectar ao servidor" | O servidor está ligado? `docker compose -f docker-compose.prod.yml ps`. O IP mudou? (fixe o IP no roteador). O firewall liberou a 3333? |
| `app` reiniciando sem parar | `docker compose -f docker-compose.prod.yml logs app` — em geral é `SESSAO_SEGREDO` curto/de exemplo ou `POSTGRES_PASSWORD` diferente da usada na criação do banco. |
| Celular ou computador perdido com o sistema aberto | O Dono, em **Configurações → Equipe**, clica em "Desconectar de todos os aparelhos" na pessoa. Cada um também vê e encerra os próprios aparelhos em **Configurações → Minha conta**. |
| Log diz "não consegui preparar o usuário hermes_app" | O banco não é o do `docker-compose` e não deixa criar usuários (banco gerenciado na nuvem). Ponha `DB_USUARIO_APP=false` no `.env`: o sistema passa a usar a conexão informada como está. |
| Esqueci a senha do Dono | Outro Dono redefine em Configurações → Equipe. Sendo o único Dono, no servidor: `docker compose -f docker-compose.prod.yml exec app node dist/redefinir-senha.js dono@suaoficina.com NovaSenha123` (fica registrado no Histórico). |
| Backup "atrasado" em Configurações | Veja o log (`logs app`, procure "backup"). Faça um manual em Configurações → Backup. |
| Mudei o computador servidor | Backup no antigo → instale no novo (passos 1–3) → restaure a cópia (seção 5) → aponte os apps para o IP novo. |

Saúde do sistema (para monitoramento): `GET http://<servidor>:3333/api/health`.
