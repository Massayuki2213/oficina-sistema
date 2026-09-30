# 0005 — Sem Redis na 1.0

**Situação:** aceita (v1.0) — remove o Redis do protótipo.

## Contexto

O Redis só servia ao limite de tentativas de login — e contava também os logins certos, o que
bloquearia a oficina inteira (um IP só) no começo do expediente. Era um segundo serviço para
instalar, monitorar e incluir no backup, numa oficina de 2 a 10 pessoas.

## Decisão

Limite de falhas de login em memória (`src/lib/tentativas.ts`), contando só erros. Sem cache
distribuído: o volume (~5 carros por dia) não precisa.

## Consequências

- Uma peça a menos na instalação e no backup.
- Com mais de uma instância da API (não é o caso de uma oficina), o limite passaria a ser por
  instância. Se algum dia houver várias, reavaliar (Redis ou uma tabela no Postgres).
