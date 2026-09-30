# Hermes — Guia de desenvolvimento

Para quem vai mexer no código. Visão de produto: [README](../README.md) ·
instalação na oficina: [IMPLANTACAO.md](IMPLANTACAO.md) · decisões de arquitetura: [adr/](adr/) ·
regras de negócio (RN-xx): [PLANEJAMENTO.md](../PLANEJAMENTO.md).

## Começando

Pré-requisitos: **Node 22+** (usamos 24) e **Docker**.

```bash
cp .env.example .env        # ajuste POSTGRES_PORT se a 5432 estiver ocupada
npm install
npm run infra:up            # PostgreSQL 16 de desenvolvimento
npm run db:generate         # cliente do Prisma
npm run db:migrate          # cria as tabelas
npm run db:seed             # cenário de demonstração (opcional)
npm run dev                 # API (:3333) + tela (:5173) juntas
```

Abra http://localhost:5173. Usuários do cenário de demonstração (senha `hermes123`):
`dono@hermes.local`, `atendente@hermes.local`, `mecanico@hermes.local`.
Documentação interativa da API: http://localhost:3333/api/docs.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | API (tsx watch) + tela (Vite) com proxy de `/api` |
| `npm run lint` | ESLint em todo o monorepo |
| `npm run typecheck` | `tsc --noEmit` nos três pacotes |
| `npm run test:prepare` | aplica as migrações no banco de **teste** (`hermes_test`) e prepara o usuário `hermes_app` |
| `npm test` | contrato (21) + API contra Postgres real (231) + tela (20) |
| `npm run build` | tela (`apps/desktop/dist`) e API (`apps/api/dist`) |
| `npm start` | API compilada servindo a tela compilada (como em produção) |
| `npm run docker:build` | imagem de produção `hermes:1.0.0` |
| `npm run senha:redefinir -w @hermes/api -- <email> <senha>` | recuperação de acesso |

## Estrutura

```
├── apps/
│   ├── api/                  # servidor: Fastify 5 + Prisma 6 + PostgreSQL
│   │   ├── prisma/           # schema, migrações, seed (cenário de demonstração)
│   │   ├── src/
│   │   │   ├── app.ts        # monta o Fastify: plugins + módulos sob /api
│   │   │   ├── server.ts     # sobe, agenda o backup, encerra com calma
│   │   │   ├── cli/          # comandos de linha (redefinir senha)
│   │   │   ├── plugins/      # sessão, erros, segurança (helmet/CORS), docs, tela
│   │   │   ├── lib/          # env validado, prisma, erros, datas, paginação, auditoria
│   │   │   ├── dominio/      # regras que cruzam módulos: estoque (kardex), preço, caixa, fiado
│   │   │   └── modules/<x>/  # <x>.routes.ts (HTTP) + <x>.service.ts (regra) [+ mapper]
│   │   └── tests/            # testes de integração (HTTP e serviços) contra Postgres
│   │
│   └── desktop/              # a TELA (React 18 + Vite + Tailwind + TanStack Query)
│       ├── src/
│       │   ├── api/          # cliente HTTP, ações/confirmações, listas paginadas, catálogo
│       │   ├── components/   # layout, kit de UI (ui/), editor de itens, impressão
│       │   ├── features/<x>/ # uma pasta por área (ordens, orcamentos, estoque...)
│       │   ├── lib/          # máscaras, formatos, período, CSV, WhatsApp, avisos
│       │   └── rotas.tsx     # tabela única: menu + permissão de cada tela
│       └── electron/         # app de desktop (janela para o servidor) — pacote à parte
│
└── packages/shared/          # CONTRATO entre API e tela
    └── src/
        ├── schemas/          # zod: o que a API aceita (validado nos dois lados)
        ├── dtos.ts           # o formato exato do que a API devolve
        ├── enums.ts          # enums, rótulos pt-BR, fluxo de status da OS
        ├── permissions.ts    # o que cada perfil pode (a mesma regra na API e na tela)
        ├── dinheiro.ts       # contas em centavos (a prévia da tela = o valor gravado)
        ├── validacao.ts      # CPF/CNPJ (inclusive alfanumérico), placa, telefone
        └── erros.ts          # códigos de erro que a tela trata
```

## Como as peças conversam

- **Um contrato só.** Toda rota valida a entrada com um schema de `@hermes/shared/schemas`
  (via `fastify-type-provider-zod`) e devolve um DTO de `@hermes/shared`. A tela importa os
  mesmos tipos: mudou o contrato, o TypeScript acusa os dois lados. ([ADR 0001](adr/0001-monorepo-e-contrato-compartilhado.md))
- **Regra mora no servidor.** O service decide (estoque, dinheiro, permissão fina); a rota só
  traduz HTTP. O que cruza módulos fica em `src/dominio/` (ex.: `darSaida` baixa estoque com
  trava de linha e registra o kardex com o saldo depois do movimento).
- **Dinheiro em centavos.** `somar/subtrair/multiplicar/dividirEmParcelas` de `@hermes/shared`
  em todo cálculo, dos dois lados. Nunca `0.1 + 0.2`. ([ADR 0003](adr/0003-dinheiro-em-centavos-e-kardex.md))
- **Datas no fuso da oficina** (`TZ`, padrão `America/Sao_Paulo`): "o caixa de hoje" e "o mês"
  são contados nele, não em UTC. Data sem hora (`"2026-09-30"`) é dia local — na tela, use
  `paraData`/`dataBR` de `lib/format.ts`, nunca `new Date("2026-09-30")`.
- **Sessão opaca no banco**, num cookie httpOnly (`hermes_sessao`, SameSite=Strict). A tela
  nunca vê o token; o banco guarda só o HMAC dele (`sessoes`). Logout, troca de senha e
  "sair dos outros aparelhos" apagam a linha e valem na hora (`lib/sessoes.ts`).
  ([ADR 0009](adr/0009-sessao-opaca-no-banco.md))
- **Fechado por padrão.** Toda rota sob `/api` exige sessão (`exigirSessao`, em `app.ts`); o
  módulo só diz quem pode (`exigir(...)`). Rota aberta se declara com `config: { publica: true }`
  e entra na lista do `tests/seguranca.test.ts`. ([ADR 0008](adr/0008-negar-por-padrao.md))
- **O servidor não é dono do banco.** Em produção ele conecta como `hermes_app` (só lê e grava
  dados); o dono fica para as migrações. Os testes da API também rodam assim.
  ([ADR 0007](adr/0007-banco-como-ultima-linha-de-defesa.md))
- **Confirmação por código de erro.** Quando a regra pede decisão humana (desconto acima do
  teto, peça em falta, conflito de agenda, fiado em atraso), a API responde com um `codigo`
  e a tela pergunta e reenvia (`useConfirmacoes` em `api/acoes.ts`). ([ADR 0006](adr/0006-confirmacao-por-codigo-de-erro.md))
- **Auditoria automática, com o valor anterior.** Toda escrita bem-sucedida vira linha no
  histórico (hooks em `lib/auditoria.ts`); rotas nomeiam a ação com `config: { acao: '...' }`.
  Quando a rota altera um registro com `:id`, o hook tira um retrato antes e depois
  (`lib/retratos.ts`) e guarda o que mudou: "Preço de venda: R$ 80,00 → R$ 50,00". Entidade
  nova? Uma entrada em `RETRATOS`. Dado pessoal de contato vai como "(alterado)", sem o valor.
- **Concorrência otimista nos formulários.** Formulário que grava o registro inteiro manda a
  `versao` que carregou; se alguém salvou no meio, a API responde 409 `CONFLITO_EDICAO` com
  quem e quando (`lib/versao.ts`). ([ADR 0010](adr/0010-concorrencia-otimista.md))
- **POST idempotente.** A tela manda `Idempotency-Key` em todo POST e, se a rede falhar,
  repete com a mesma chave; o servidor devolve a resposta guardada em vez de lançar de novo
  (`plugins/idempotencia.ts`). Nada a fazer num endpoint novo: vale para todos.
  ([ADR 0011](adr/0011-idempotencia-dos-post.md))
- **A API serve a tela** (mesma origem, sem CORS em produção) e o app de desktop é só uma
  janela para ela. ([ADR 0004](adr/0004-api-serve-a-tela-e-desktop-e-janela.md))

## Receitas

### Um endpoint novo

1. Schema de entrada em `packages/shared/src/schemas/<area>.ts` (e o `z.input` exportado).
2. DTO de saída em `packages/shared/src/dtos.ts`.
3. Regra em `apps/api/src/modules/<x>/<x>.service.ts` (erros com `invalido`, `conflito`,
   `naoEncontrado`, `semPermissao` de `lib/errors.ts`).
4. Rota em `<x>.routes.ts` com `schema: { body/querystring/params }` e `exigir('<permissao>')`.
   A sessão já é exigida para você; rota pública (raríssimo) leva `config: { publica: true }`
   e precisa entrar na lista `PUBLICAS` do `tests/seguranca.test.ts`.
5. Teste em `apps/api/tests/` (use os ajudantes de `tests/ajuda.ts`).

### Uma tela nova

1. Pasta em `apps/desktop/src/features/<x>/` com a página `default export`.
2. Linha na tabela `ROTAS` de `src/rotas.tsx` (menu, ícone e permissão saem dela).
3. Leitura com `useQuery`/`useListaPaginada` (a 1ª parte da chave é o nome da lista, ex.:
   `['ordens']`); escrita com `useAcao(fn, { invalidar: [['ordens']] })`.
4. Peças do kit em `components/ui` (Modal, Campo, InputDinheiro, BuscaSelect, Painel...).

### Mudar o banco

```bash
# edite apps/api/prisma/schema.prisma
npm run db:migrate -- --name descricao-curta   # gera a migração e aplica no banco de dev
npm run test:prepare                            # aplica no banco de teste
```

Migração com mudança de dado (não só de estrutura): escreva o SQL dentro do mesmo
`migration.sql` — ver `20260929120000_v1_0` como exemplo.

**Restrições `CHECK`** o Prisma não gera: coluna nova com regra de faixa (valor ≥ 0, % até 100)
ganha um `ALTER TABLE ... ADD CONSTRAINT ... CHECK (...)` escrito à mão na migração dela — ver
`20260930150000_restricoes_check`. Tabela nova não precisa de `GRANT`: o `hermes_app` recebe
acesso sozinho (privilégio padrão + a partida do container).

## Testes

- **API** (`apps/api/tests`): integração de verdade contra PostgreSQL (`hermes_test`), em série
  (cada teste limpa as tabelas). Cobrem o caminho do dinheiro (orçamento → OS → estoque →
  recebimento → estorno), garantia, agenda, permissões e o HTTP (cookies, erros, auditoria).
- **Contrato** (`packages/shared/tests`): regras puras (centavos, CPF/CNPJ, placa).
- **Tela** (`apps/desktop/src/**/__tests__`): funções puras onde erro vira dinheiro errado
  (totais do editor de itens, máscaras, datas das parcelas, CSV).

O banco de teste vem de `TEST_DATABASE_URL` ou do Postgres de desenvolvimento
(`POSTGRES_PORT` do `.env`) com o nome `hermes_test`. A API testada conecta como `hermes_app`
(igual à produção); o `db` dos testes, que monta cenários e limpa as tabelas, como dono.
`TEST_DATABASE_URL` precisa, portanto, de um usuário que possa criar usuários.

## App de desktop

Pasta `apps/desktop/electron/`, **fora dos workspaces** (o Electron tem ~100 MB e não deve
entrar no build do servidor nem no CI).

```bash
cd apps/desktop/electron
npm install
npm start                 # abre a janela (pede o endereço do servidor na 1ª vez)
npm run dist              # gera apps/desktop/release/Hermes Setup 1.0.0.exe
```

Dois tropeços conhecidos:

- **Terminal dentro do VS Code** pode exportar `ELECTRON_RUN_AS_NODE=1`, e aí o Electron roda
  como Node puro (`Cannot read properties of undefined (reading 'handle')`). Rode num terminal
  comum ou limpe a variável (`$env:ELECTRON_RUN_AS_NODE=$null` no PowerShell).
- **Node 24**: o instalador do Electron às vezes não extrai o binário (a pasta
  `node_modules/electron/dist` fica só com `locales`). Extraia o zip do cache à mão:

  ```powershell
  $zip = Get-ChildItem "$env:LOCALAPPDATA\electron\Cache" -Recurse -Filter "electron-v*-win32-x64.zip" | Select-Object -First 1
  Expand-Archive $zip.FullName -DestinationPath node_modules\electron\dist -Force
  Set-Content node_modules\electron\path.txt "electron.exe" -NoNewline
  ```

  O `electron-builder` usa esse mesmo binário (`build.electronDist`), sem extrair de novo.

Segurança da janela: sem Node na página, `contextIsolation` e `sandbox` ligados, navegação
presa ao servidor escolhido, links externos (WhatsApp) no navegador padrão, e a ponte do
preload só atende a página local de configuração.

## CI

`.github/workflows/ci.yml`: lint → tipos → migrações no Postgres do serviço → testes → build →
build da imagem Docker (sem publicar). Em paralelo, **segredos no histórico inteiro do git**
(gitleaks) e **vulnerabilidades conhecidas** nas dependências de produção (`npm audit`, reprova
em alta ou crítica). Todo PR precisa passar.

`.github/dependabot.yml`: PRs de atualização toda segunda para a `dev`, agrupados (produção /
desenvolvimento; versão maior em PR próprio). Ligue também **Dependabot security updates** em
*Settings → Code security* do repositório: correção de segurança não espera a segunda.

## Convenções

- Código, nomes e mensagens **em português**, no vocabulário da oficina (é o idioma do domínio
  e de quem mantém). Termos técnicos consagrados ficam como são (`schema`, `hook`, `DTO`).
- Comentário explica **por quê**, não o quê — e cita a regra (`RN-08`) quando houver.
- Mensagem de erro é para o balconista: diz o que aconteceu e o que fazer.
- Sem `any`; sem valor de dinheiro em `number` solto fora das funções de `dinheiro.ts`.
