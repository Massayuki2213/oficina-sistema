# 0007 — O banco como última linha de defesa

**Situação:** aceita (v1.0)

## Contexto

A API valida tudo na entrada (zod) e as regras moram nos services. Mesmo assim, duas coisas
ficavam só na confiança:

- **Poder demais:** o servidor conectava como o dono do banco — que, na imagem oficial do
  PostgreSQL, é superusuário. Uma injeção de SQL (hoje não há: todo SQL cru é parametrizado)
  poderia apagar tabelas ou até rodar comando no servidor (`COPY ... TO PROGRAM`).
- **Dado impossível:** nada no banco impedia valor negativo, parcela paga além do devido ou
  total que não fecha com subtotal − desconto. Um bug numa regra, um script de manutenção ou
  uma correção feita à mão gravariam em silêncio.

## Decisão

**Dois usuários no banco.**

- O **dono** (`hermes`, o do `docker-compose`) cria e altera tabelas. Serve só às migrações
  e aos comandos de administração (`redefinir-senha`).
- O **`hermes_app`** lê e grava dados (`SELECT, INSERT, UPDATE, DELETE`) e nada mais. É com
  ele que o servidor conecta.

A partida do container (`docker/entrypoint.sh`) aplica as migrações como dono e depois roda
`dist/usuario-do-banco.js`, que cria ou atualiza o `hermes_app` com uma **senha nova sorteada
a cada partida**, libera as tabelas e devolve a `DATABASE_URL` que o servidor vai usar. Não há
senha nova para o instalador guardar. Banco gerenciado que não deixa criar usuário:
`DB_USUARIO_APP=false`, e o servidor usa a `DATABASE_URL` como está.

**Restrições `CHECK`** (migração `20260930150000_restricoes_check`): dinheiro nunca negativo,
lançamento de caixa sempre positivo (o sentido é o tipo), `total = subtotal − desconto`
(RN-09), `valor_pago` entre 0 e o valor da parcela, quantidade de item positiva, regras da
oficina em faixa válida. De fora, de propósito: `estoque_atual` (fica negativo com peça
encomendada, RN-03) e o `AJUSTE` do kardex (a diferença tem sinal).

Quando uma restrição recusa uma gravação, a API responde **400** ("nada foi gravado") e o log
registra só o nome da restrição — a mensagem do banco traz a linha recusada, com dado de
cliente.

## Consequências

- Os testes da API rodam como `hermes_app` (`npm run test:prepare` cria o usuário): código que
  precise de mais do que DML quebra no teste, não na oficina.
- O Prisma não gera `CHECK`. Coluna nova com regra de faixa = uma `ALTER TABLE ... ADD
  CONSTRAINT` escrita à mão na migração dela.
- O dono do banco continua no ambiente do container (as migrações precisam dele). O ganho é
  contra injeção de SQL, não contra quem já tem acesso ao servidor.
- Restauração de backup não precisa de passo extra: os `GRANT`s voltam na próxima partida.
