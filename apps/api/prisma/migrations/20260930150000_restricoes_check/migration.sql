-- ============================================================
-- Restrições CHECK: a última linha de defesa dos dados.
--
-- A API já valida tudo isto (zod na entrada, regras nos services).
-- Aqui é o banco recusando o que nunca deveria existir, venha de
-- onde vier: um bug numa regra, um script de manutenção, uma
-- correção feita à mão no banco. O Prisma não gera CHECK — elas
-- vivem só nesta migração (ver docs/adr/0007).
--
-- Deliberadamente de fora:
--   pecas.estoque_atual  — pode ficar negativo (peça encomendada, RN-03);
--   movimentos AJUSTE    — a diferença do inventário tem sinal.
-- ============================================================

-- ---- Cadastros ----
ALTER TABLE "usuarios"
  ADD CONSTRAINT "usuarios_comissao_pct_check" CHECK ("comissao_pct" IS NULL OR "comissao_pct" BETWEEN 0 AND 100);

ALTER TABLE "carros"
  ADD CONSTRAINT "carros_km_atual_check" CHECK ("km_atual" IS NULL OR "km_atual" >= 0),
  ADD CONSTRAINT "carros_ano_check" CHECK ("ano" IS NULL OR "ano" BETWEEN 1900 AND 2200);

ALTER TABLE "servicos"
  ADD CONSTRAINT "servicos_preco_check" CHECK ("preco_mao_de_obra" >= 0),
  ADD CONSTRAINT "servicos_tempo_check" CHECK ("tempo_estimado_min" IS NULL OR "tempo_estimado_min" >= 0);

ALTER TABLE "fornecedores"
  ADD CONSTRAINT "fornecedores_prazo_check" CHECK ("prazo_entrega_dias" IS NULL OR "prazo_entrega_dias" >= 0);

ALTER TABLE "pecas"
  ADD CONSTRAINT "pecas_precos_check" CHECK ("preco_custo" >= 0 AND "preco_venda" >= 0),
  ADD CONSTRAINT "pecas_estoque_minimo_check" CHECK ("estoque_minimo" >= 0);

-- ---- Documentos: RN-09, total = subtotal − desconto, nada negativo ----
ALTER TABLE "orcamentos"
  ADD CONSTRAINT "orcamentos_valores_check" CHECK ("subtotal" >= 0 AND "desconto" >= 0 AND "desconto" <= "subtotal"),
  ADD CONSTRAINT "orcamentos_total_check" CHECK ("total" = "subtotal" - "desconto");

ALTER TABLE "ordens_servico"
  ADD CONSTRAINT "ordens_servico_valores_check" CHECK ("subtotal" >= 0 AND "desconto" >= 0 AND "desconto" <= "subtotal"),
  ADD CONSTRAINT "ordens_servico_total_check" CHECK ("total" = "subtotal" - "desconto"),
  ADD CONSTRAINT "ordens_servico_km_check" CHECK ("km_entrada" IS NULL OR "km_entrada" >= 0);

ALTER TABLE "vendas"
  ADD CONSTRAINT "vendas_valores_check" CHECK ("subtotal" >= 0 AND "desconto" >= 0 AND "desconto" <= "subtotal"),
  ADD CONSTRAINT "vendas_total_check" CHECK ("total" = "subtotal" - "desconto");

ALTER TABLE "compras"
  ADD CONSTRAINT "compras_valor_check" CHECK ("valor_total" >= 0);

-- ---- Itens: quantidade positiva, preço e custo nunca negativos ----
ALTER TABLE "orcamento_servicos"
  ADD CONSTRAINT "orcamento_servicos_item_check" CHECK ("quantidade" > 0 AND "preco_unit" >= 0);

ALTER TABLE "orcamento_pecas"
  ADD CONSTRAINT "orcamento_pecas_item_check" CHECK ("quantidade" > 0 AND "preco_unit" >= 0);

ALTER TABLE "os_servicos"
  ADD CONSTRAINT "os_servicos_item_check" CHECK ("quantidade" > 0 AND "preco_unit" >= 0);

ALTER TABLE "os_pecas"
  ADD CONSTRAINT "os_pecas_item_check" CHECK ("quantidade" > 0 AND "preco_unit" >= 0 AND ("custo_unit" IS NULL OR "custo_unit" >= 0));

ALTER TABLE "venda_itens"
  ADD CONSTRAINT "venda_itens_item_check" CHECK ("quantidade" > 0 AND "preco_unit" >= 0 AND ("custo_unit" IS NULL OR "custo_unit" >= 0));

ALTER TABLE "compra_itens"
  ADD CONSTRAINT "compra_itens_item_check" CHECK ("quantidade" > 0 AND "custo_unit" >= 0);

-- ---- Dinheiro ----
-- Lançamento de caixa sempre positivo: o sentido é o tipo (ENTRADA/SAIDA).
ALTER TABLE "lancamentos_caixa"
  ADD CONSTRAINT "lancamentos_caixa_valor_check" CHECK ("valor" > 0);

ALTER TABLE "despesas"
  ADD CONSTRAINT "despesas_valor_check" CHECK ("valor" > 0);

-- Baixa parcial acumula em valor_pago, que nunca passa do valor da parcela.
ALTER TABLE "contas_receber"
  ADD CONSTRAINT "contas_receber_valor_check" CHECK ("valor" > 0 AND "valor_pago" >= 0 AND "valor_pago" <= "valor"),
  ADD CONSTRAINT "contas_receber_parcela_check" CHECK ("parcela" >= 1 AND "parcela" <= "total_parcelas");

-- ---- Estoque (kardex) ----
ALTER TABLE "movimentos_estoque"
  ADD CONSTRAINT "movimentos_estoque_quantidade_check" CHECK (
    CASE WHEN "tipo" = 'AJUSTE' THEN "quantidade" <> 0 ELSE "quantidade" > 0 END
  ),
  ADD CONSTRAINT "movimentos_estoque_custo_check" CHECK ("custo_unit" IS NULL OR "custo_unit" >= 0);

-- ---- Configuração da oficina ----
ALTER TABLE "oficina"
  ADD CONSTRAINT "oficina_regras_check" CHECK (
    "margem_padrao" >= 0
    AND "desconto_max_sem_senha" BETWEEN 0 AND 100
    AND "garantia_dias" >= 0
    AND "validade_orcamento_dias" >= 1
  );
