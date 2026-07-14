# Hermes — Sistema de Gestão para Oficina Mecânica

Monorepo do sistema Hermes. Documento de arquitetura completo em [PLANEJAMENTO.md](PLANEJAMENTO.md).

## 🗂 Estrutura

```
oficina-sistema/
├── PLANEJAMENTO.md         # documento de planejamento e arquitetura (v1.1)
├── prototipo/              # protótipo clicável (Fase 1) — abra o index.html no navegador
├── docker-compose.yml      # sobe o banco (PostgreSQL) + cache (Redis) local
├── .env.example            # variáveis de ambiente (copie para .env)
│
├── apps/
│   ├── api/                # 🧠 Backend — Fastify + Prisma + Redis (regras de negócio)
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # modelo de dados (banco)
│   │   │   └── seed.ts         # dados iniciais
│   │   └── src/
│   │       ├── lib/            # infra: env, prisma (banco), redis (cache)
│   │       ├── modules/        # um por domínio (routes + service + schema)
│   │       │   ├── health/     #   status da API/banco/cache
│   │       │   └── clientes/   #   CRUD + busca + cache
│   │       ├── app.ts          # monta o Fastify e registra os módulos
│   │       └── server.ts       # sobe o servidor
│   │
│   └── desktop/            # 💻 App Desktop — Electron + React (migra do protótipo)
│
└── packages/
    └── shared/             # contrato compartilhado (API + Desktop)
        └── src/
            ├── enums.ts        # enums do domínio + rótulos pt-BR
            ├── entities.ts     # entidades do domínio (seção 4)
            └── permissions.ts  # permissões por perfil
```

## 🧱 Stack

| Camada        | Tecnologia                    |
|---------------|-------------------------------|
| App Desktop   | Electron + React + TypeScript |
| Backend/API   | Node.js + Fastify + TypeScript|
| **Banco**     | **PostgreSQL** (via Prisma)   |
| **Cache**     | **Redis** (via ioredis)       |
| Login         | JWT + perfis (Dono/Atendente/Mecânico) |

## 🚀 Começando

Pré-requisitos: **Node 20+** e **Docker Desktop**.

```bash
# 1. Copie as variáveis de ambiente
cp .env.example .env

# 2. Suba o banco (PostgreSQL) e o cache (Redis)
npm run infra:up

# 3. Instale as dependências (workspaces)
npm install

# 4. Gere o client do Prisma e crie as tabelas
npm run db:generate
npm run db:migrate

# 5. (opcional) Popule com dados de exemplo
npm run db:seed

# 6. Rode a API
npm run dev:api
```

Teste se está tudo de pé: <http://localhost:3333/health>
(deve responder `database: up` e `cache: up`).

## 🔧 Scripts úteis

| Comando               | O que faz                                  |
|-----------------------|--------------------------------------------|
| `npm run infra:up`    | Sobe PostgreSQL + Redis (Docker)           |
| `npm run infra:down`  | Derruba os containers                      |
| `npm run db:migrate`  | Cria/atualiza as tabelas                   |
| `npm run db:studio`   | Abre o Prisma Studio (ver o banco no navegador) |
| `npm run db:seed`     | Popula dados de exemplo                    |
| `npm run dev:api`     | Roda a API em modo desenvolvimento         |

## 👤 Usuários e senhas

O seed cria 3 usuários com a senha padrão `hermes123` (`dono@`, `atendente@`, `mecanico@hermes.local`).

> ⚠️ **Antes de usar de verdade na oficina**, entre como Dono e vá em **Configurações**: troque a
> sua senha, crie os usuários reais e **inative os de demonstração**. Lá o Dono também redefine a
> senha de quem esqueceu, e qualquer perfil troca a própria senha.

O sistema não deixa a oficina se trancar para fora: o único Dono ativo não pode ser rebaixado nem
inativado, e ninguém tira o próprio acesso.

## 💾 Backup e restauração

A API gera sozinha uma cópia do banco quando a mais recente passa de **24h** — inclusive
ao ligar o computador, para cobrir o dia em que a oficina ficou fechada. Os arquivos vão
para `apps/api/backups/` e os mais velhos que `BACKUP_RETENCAO_DIAS` (padrão: 14) são
apagados, mantendo sempre as 3 últimas cópias.

O Dono também pode gerar uma cópia na hora: `POST /backup` (e `GET /backup` mostra a
situação). Para **restaurar** um backup:

```bash
docker exec -i -e PGPASSWORD=hermes_dev hermes-postgres \
  psql -U hermes -d hermes < apps/api/backups/hermes-AAAA-MM-DD_HHMMSS.sql
```

> ⚠️ Guarde uma cópia **fora do computador da oficina** (pendrive/nuvem): backup no mesmo
> HD não protege contra o HD queimar.

## 📍 Onde estamos (Roadmap — seção 11)

- [x] **Fase 1 — Protótipo clicável** (`/prototipo`)
- [ ] **Fase 2 — MVP funcional**: estrutura do monorepo, banco + cache, API base ← *aqui*
- [ ] Fase 3 — Financeiro completo
- [ ] Fase 4 — Extras (agenda, WhatsApp, garantia, NF-e)
