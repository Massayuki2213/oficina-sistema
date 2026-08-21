-- AlterTable
ALTER TABLE "ordens_servico" ADD COLUMN     "os_origem_id" TEXT;

-- CreateTable
CREATE TABLE "oficina" (
    "id" TEXT NOT NULL DEFAULT 'unica',
    "nome" TEXT NOT NULL DEFAULT 'Minha Oficina',
    "subtitulo" TEXT,
    "cnpj" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "endereco" TEXT,
    "logo" TEXT,
    "margem_padrao" DECIMAL(5,2) NOT NULL DEFAULT 80,
    "desconto_max_sem_senha" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "garantia_dias" INTEGER NOT NULL DEFAULT 15,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oficina_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_os_origem_id_fkey" FOREIGN KEY ("os_origem_id") REFERENCES "ordens_servico"("id") ON DELETE SET NULL ON UPDATE CASCADE;
