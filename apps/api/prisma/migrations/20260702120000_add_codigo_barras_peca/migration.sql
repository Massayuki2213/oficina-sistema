-- AlterTable
ALTER TABLE "pecas" ADD COLUMN     "codigo_barras" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "pecas_codigo_barras_key" ON "pecas"("codigo_barras");
