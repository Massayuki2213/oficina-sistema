# 0001 — Monorepo com contrato compartilhado

**Situação:** aceita (v1.0)

## Contexto

No protótipo, cada tela redeclarava as interfaces do que a API devolvia, e a validação da
entrada existia só no servidor. Mudar um campo quebrava a tela em silêncio — descobria-se
no balcão.

## Decisão

- npm workspaces: `apps/api`, `apps/desktop` (a tela) e `packages/shared`.
- `packages/shared` é o **contrato**: schemas zod da entrada (`/schemas`), DTOs da saída,
  enums com rótulos pt-BR, fluxo de status da OS, permissões por perfil, códigos de erro e a
  matemática de dinheiro.
- A API valida toda rota com esses schemas (`fastify-type-provider-zod`) e os mapeadores
  devolvem exatamente os DTOs. A tela importa os mesmos tipos e as mesmas funções.
- O pacote é TypeScript puro, sem build próprio: o Vite e o `tsx` leem o fonte; no build de
  produção da API o `tsup` o embute no `dist/server.js`.

## Consequências

- Mudou o contrato, o `tsc` acusa API e tela no mesmo commit.
- A prévia de totais da tela usa a mesma função de centavos do servidor — o número que o
  balconista vê é o que vai ser gravado.
- O preço: o pacote compartilhado não pode depender de nada de servidor (Prisma, Node) nem de
  navegador (DOM). Só zod.
