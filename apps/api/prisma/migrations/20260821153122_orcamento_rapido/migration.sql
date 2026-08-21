-- DropForeignKey
ALTER TABLE "orcamentos" DROP CONSTRAINT "orcamentos_carro_id_fkey";

-- DropForeignKey
ALTER TABLE "orcamentos" DROP CONSTRAINT "orcamentos_cliente_id_fkey";

-- AlterTable
ALTER TABLE "orcamentos" ADD COLUMN     "contato_nome" TEXT,
ADD COLUMN     "contato_telefone" TEXT,
ADD COLUMN     "veiculo_descricao" TEXT,
ALTER COLUMN "cliente_id" DROP NOT NULL,
ALTER COLUMN "carro_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_carro_id_fkey" FOREIGN KEY ("carro_id") REFERENCES "carros"("id") ON DELETE SET NULL ON UPDATE CASCADE;
