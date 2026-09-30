# 0008 — Rotas da API fechadas por padrão

**Situação:** aceita (v1.0)

## Contexto

Cada módulo ligava a exigência de sessão no próprio arquivo
(`app.addHook('onRequest', app.autenticar)`). Funcionava — até o dia em que um módulo novo
esquecesse a linha e nascesse **aberto para qualquer um na rede**, sem nenhum teste reclamar.
Segurança que depende de lembrar falha em silêncio.

Separado disso, a senha do Dono que autoriza desconto acima do teto (RN-08) não tinha freio:
um usuário logado podia testar senhas à vontade — e é a mesma senha do login do Dono.

## Decisão

- **Sessão exigida no escopo `/api` inteiro** (`exigirSessao` em `plugins/autenticacao.ts`,
  registrado em `app.ts`). Os módulos só dizem **quem** pode (`exigir('permissao')`), nunca
  **se** precisa entrar.
- **Rota pública se declara** na própria rota, à vista de quem revisa:
  `config: { publica: true }`. Hoje são cinco: saúde, situação, login, primeiro acesso e logout.
- **Teste que varre todas as rotas** (`tests/seguranca.test.ts`): a lista de públicas tem que
  ser exatamente a esperada, e todas as outras respondem 401 sem sessão.
- **Freio na senha do Dono**: 5 erros em 15 minutos travam aquela pessoa (429); cada erro vai
  para o Histórico (`SENHA_DONO_INCORRETA`), já que a operação recusada não passa pelo hook de
  auditoria.

## Consequências

- Rota pública nova exige mudar a lista do teste — é o momento de alguém perguntar "precisa
  mesmo?".
- A checagem de sessão roda antes da validação do corpo: sem sessão, a API não diz nem que o
  formato está errado.
