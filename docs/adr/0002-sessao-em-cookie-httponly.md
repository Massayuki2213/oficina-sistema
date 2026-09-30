# 0002 — Sessão em cookie httpOnly, perfil lido do banco

**Situação:** aceita (v1.0) — substitui o token no `localStorage` do protótipo.
O JWT e a `sessaoVersao` foram depois trocados por sessão opaca no banco: ver [ADR 0009](0009-sessao-opaca-no-banco.md).

## Contexto

O protótipo guardava o token no `localStorage` (legível por qualquer script da página) e o
perfil ia dentro do token: rebaixar ou desativar um funcionário só valia quando o token
expirasse. O funcionário desligado continuava com acesso até o fim do turno.

## Decisão

- Token JWT num cookie **httpOnly, SameSite=Strict** (`hermes_sessao`); `Secure` automático
  atrás de HTTPS (`COOKIE_SECURE=auto`). O JavaScript da tela nunca vê o token.
- O token carrega só o id e a `sessaoVersao`. A cada requisição, usuário e perfil são lidos
  do banco; trocar/redefinir senha ou desativar incrementa `sessaoVersao` e derruba as
  sessões na hora.
- O limite de tentativas de login conta só **falhas** (por IP+e-mail e por IP) — a oficina
  inteira sai por um IP só e não pode ser bloqueada pelos logins certos.
- `Authorization: Bearer` continua aceito (integrações e testes).

## Consequências

- Uma consulta por requisição — irrelevante no volume de uma oficina.
- Mesma origem obrigatória para o cookie: por isso a API serve a tela (ADR 0004) e o Vite faz
  proxy de `/api` no desenvolvimento.
