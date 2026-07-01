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
│   │       ├── config/         # env, prisma (banco), redis (cache)
│   │       ├── modules/        # domínios: clientes, orçamentos, ordens, estoque, caixa...
│   │       ├── routes/         # rotas HTTP
│   │       ├── app.ts
│   │       └── server.ts
│   │
│   └── desktop/            # 💻 App Desktop — Electron + React (migra do protótipo)
│
└── packages/
    └── shared/             # tipos/enums compartilhados entre API e Desktop
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

## 📍 Onde estamos (Roadmap — seção 11)

- [x] **Fase 1 — Protótipo clicável** (`/prototipo`)
- [ ] **Fase 2 — MVP funcional**: estrutura do monorepo, banco + cache, API base ← *aqui*
- [ ] Fase 3 — Financeiro completo
- [ ] Fase 4 — Extras (agenda, WhatsApp, garantia, NF-e)
