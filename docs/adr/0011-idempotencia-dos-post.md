# 0011 — Idempotência dos POST (sem venda em dobro)

**Situação:** aceita (v1.0)

## Contexto

O clique duplo já era barrado na tela (botão ocupado) e o recebimento da OS tem trava de
linha. Faltava o caso de rede: a atendente registra a venda, o servidor grava, **a resposta se
perde** no Wi-Fi. A tela não sabe se deu certo; tentar de novo lança a venda duas vezes (e
baixa o estoque duas vezes). O mesmo vale para recebimento, baixa de parcela, entrada de
mercadoria, compra, lançamento no caixa.

## Decisão

- **Tela** (`api/http.ts`): todo POST leva `Idempotency-Key` (128 bits aleatórios; via
  `crypto.getRandomValues`, que funciona no `http://` da rede local — `randomUUID` não).
  Se a rede falha, o cliente **repete sozinho com a mesma chave** (até 4 tentativas, com
  espera crescente). GET/PUT/PATCH não mudam.
- **Servidor** (`plugins/idempotencia.ts`, tabela `chaves_idempotencia`), por pessoa:
  - chave nova → reserva (`INSERT ... ON CONFLICT DO NOTHING`) e segue;
  - chave concluída → devolve a resposta guardada, sem executar (header `idempotent-replayed`);
  - chave em processamento → 409 `OPERACAO_EM_ANDAMENTO` (a tela espera e pergunta de novo);
  - mesma chave com outro corpo ou rota → 422 `CHAVE_REUTILIZADA`.
- Só **sucesso** é guardado. Recusa (senha do Dono, falta de peça, validação) libera a chave:
  a pessoa corrige e reenvia.
- Chaves valem 24 h (faxina a cada POST com chave). Reserva órfã (o servidor caiu no meio)
  é assumida por quem repetir depois de 1 minuto.
- A resposta repetida não gera segunda linha no Histórico.

## Consequências

- Sem chave, o POST funciona como antes (integrações).
- A reserva e a operação não estão na mesma transação: se o servidor cair *depois* de gravar
  a venda e *antes* de guardar a resposta (uma janela de milissegundos), a repetição
  processaria de novo. Aceito para o porte da oficina.
- Uma escrita e uma leitura a mais por POST — irrelevante no volume de uma oficina.
