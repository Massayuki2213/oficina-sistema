-- ============================================================
-- Idempotência dos POST (ADR 0011): a resposta de cada operação
-- fica guardada 24 h pela chave que a tela mandou. Se a rede falhar
-- e a tela repetir com a mesma chave, recebe a resposta guardada em
-- vez de lançar a venda / o recebimento duas vezes.
-- ============================================================

-- CreateTable
CREATE TABLE "chaves_idempotencia" (
    "chave" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "rota" TEXT NOT NULL,
    "hash_corpo" TEXT NOT NULL,
    "status" INTEGER,
    "resposta" TEXT,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chaves_idempotencia_pkey" PRIMARY KEY ("usuario_id","chave")
);

-- CreateIndex
CREATE INDEX "chaves_idempotencia_criada_em_idx" ON "chaves_idempotencia"("criada_em");

