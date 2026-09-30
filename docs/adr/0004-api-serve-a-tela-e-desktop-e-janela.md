# 0004 — A API serve a tela; o app de desktop é uma janela

**Situação:** aceita (v1.0)

## Contexto

O plano original era um app Electron com a tela embutida em cada PC. Isso significaria
instalar e atualizar cada máquina, versões diferentes da tela convivendo com uma API só, e
tablets e celulares de fora.

## Decisão

- A API serve o build da tela (`@fastify/static` com fallback de SPA). Um endereço só —
  `http://servidor:3333` — abre o sistema em qualquer aparelho da rede.
- O app de desktop (`apps/desktop/electron`) é uma **janela** apontada para esse endereço:
  configuração do servidor na primeira abertura, navegação presa a ele, links externos no
  navegador padrão.
- Produção: imagem Docker única (API + tela + `pg_dump` 16), migrações aplicadas na partida.

## Consequências

- Atualizou o servidor, atualizou todo mundo; não existe tela velha falando com API nova.
- Mesma origem: cookie de sessão sem CORS (ADR 0002).
- Sem o servidor, nenhum PC funciona. É o modelo certo para dados compartilhados em tempo real
  (o carro do balcão é o mesmo do mecânico); o backup diário protege o ponto único.
