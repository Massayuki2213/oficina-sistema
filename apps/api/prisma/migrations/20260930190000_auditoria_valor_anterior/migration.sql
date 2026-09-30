-- ============================================================
-- Histórico com o valor anterior: cada alteração registra o que
-- mudou, já legível — [{ "campo": "Preço de venda", "de": "R$ 80,00",
-- "para": "R$ 50,00" }]. Linhas antigas ficam com NULL.
-- ============================================================

-- AlterTable
ALTER TABLE "logs_auditoria" ADD COLUMN     "mudancas" JSONB;
