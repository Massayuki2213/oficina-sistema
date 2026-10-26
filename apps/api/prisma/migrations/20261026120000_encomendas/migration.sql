-- ============================================================
-- Encomenda de peças: do orçamento à nota da autopeça.
--
-- A oficina trabalha com pouco estoque: a peça é pedida à autopeça
-- depois que o cliente aprova. Cada linha de peça da OS passa a
-- guardar quanto faltou (encomenda), para quem a lista foi mandada,
-- qual compra trouxe a peça e se o Dono já conferiu o preço pela nota.
-- ============================================================

-- AlterTable
ALTER TABLE "pecas" ADD COLUMN     "preco_a_definir" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "os_pecas" ADD COLUMN     "compra_item_id" TEXT,
ADD COLUMN     "encomenda" DECIMAL(10,3) NOT NULL DEFAULT 0,
ADD COLUMN     "pedido_em" TIMESTAMP(3),
ADD COLUMN     "pedido_fornecedor_id" TEXT,
ADD COLUMN     "preco_conferido" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "os_pecas_peca_id_compra_item_id_idx" ON "os_pecas"("peca_id", "compra_item_id");

-- AddForeignKey
ALTER TABLE "os_pecas" ADD CONSTRAINT "os_pecas_pedido_fornecedor_id_fkey" FOREIGN KEY ("pedido_fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "os_pecas" ADD CONSTRAINT "os_pecas_compra_item_id_fkey" FOREIGN KEY ("compra_item_id") REFERENCES "compra_itens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Última linha de defesa (ADR 0007): não se encomenda mais do que a linha usa.
ALTER TABLE "os_pecas"
  ADD CONSTRAINT "os_pecas_encomenda_check" CHECK ("encomenda" >= 0 AND "encomenda" <= "quantidade");
