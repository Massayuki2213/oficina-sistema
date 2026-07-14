-- CreateEnum
CREATE TYPE "StatusCompra" AS ENUM ('PENDENTE', 'PAGA');

-- CreateTable
CREATE TABLE "compras" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "fornecedor_id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "numero_nota" TEXT,
    "valor_total" DECIMAL(10,2) NOT NULL,
    "status" "StatusCompra" NOT NULL DEFAULT 'PENDENTE',
    "pago_em" TIMESTAMP(3),
    "observacoes" TEXT,

    CONSTRAINT "compras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compra_itens" (
    "id" TEXT NOT NULL,
    "compra_id" TEXT NOT NULL,
    "peca_id" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "custo_unit" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "compra_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "compras_numero_key" ON "compras"("numero");

-- CreateIndex
CREATE INDEX "compras_fornecedor_id_idx" ON "compras"("fornecedor_id");

-- CreateIndex
CREATE INDEX "compras_data_idx" ON "compras"("data");

-- CreateIndex
CREATE INDEX "compra_itens_compra_id_idx" ON "compra_itens"("compra_id");

-- AddForeignKey
ALTER TABLE "compras" ADD CONSTRAINT "compras_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra_itens" ADD CONSTRAINT "compra_itens_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra_itens" ADD CONSTRAINT "compra_itens_peca_id_fkey" FOREIGN KEY ("peca_id") REFERENCES "pecas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
