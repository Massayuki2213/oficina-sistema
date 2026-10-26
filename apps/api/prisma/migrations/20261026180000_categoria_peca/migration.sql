-- Categoria da peça (texto livre: "Freios", "Elétrica"...) para filtrar o estoque.
-- As peças que já existem ficam sem categoria; as do catálogo inicial ganham a
-- delas quando o Dono carrega o catálogo de novo.

-- AlterTable
ALTER TABLE "pecas" ADD COLUMN     "categoria" TEXT;

-- CreateIndex
CREATE INDEX "pecas_categoria_idx" ON "pecas"("categoria");
