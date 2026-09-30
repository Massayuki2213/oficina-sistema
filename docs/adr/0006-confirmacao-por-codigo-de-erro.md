# 0006 — Decisão humana pedida por código de erro

**Situação:** aceita (v1.0)

## Contexto

Várias regras não são "proibido", e sim "confirme": desconto acima do teto (senha do Dono,
RN-08), peça que falta no estoque (encomendar, RN-03), dois carros no mesmo horário
(encaixar, RN-19), fiado para quem está devendo (liberar, RN-11.2). Validar isso só na tela
deixaria a regra furável; só no servidor, sem conversa, travaria o balcão.

## Decisão

A API recusa com um **código** (`SENHA_DONO_NECESSARIA`, `ESTOQUE_INSUFICIENTE`,
`CONFLITO_AGENDA`, `FIADO_BLOQUEADO`) e os detalhes. A tela, num lugar só
(`useConfirmacoes` em `src/api/acoes.ts`), pergunta ao usuário e reenvia com a resposta
(`senhaDono`, `confirmarSemEstoque`, `ignorarConflito`, `liberarFiado`). A decisão fica no
histórico (auditoria).

## Consequências

- A regra vale para qualquer cliente da API; a tela só conduz a conversa.
- Uma ação pode levar duas ou três idas ao servidor quando há confirmação — imperceptível.
- Regra nova desse tipo = um código novo em `erros.ts` + um ramo em `useConfirmacoes`.
