-- ============================================================
-- Sessão opaca guardada no banco, no lugar do JWT (ADR 0009).
-- Cada login vira uma linha; logout e "encerrar sessões" apagam a
-- linha e a sessão cai na hora. A `sessao_versao` do usuário (o jeito
-- do JWT de derrubar tokens) deixa de ser necessária. Quem estiver
-- logado durante a atualização precisa entrar de novo — uma vez.
-- ============================================================

-- AlterTable
ALTER TABLE "usuarios" DROP COLUMN "sessao_versao";

-- CreateTable
CREATE TABLE "sessoes" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_uso" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "aparelho" TEXT,

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_token_hash_key" ON "sessoes"("token_hash");

-- CreateIndex
CREATE INDEX "sessoes_usuario_id_idx" ON "sessoes"("usuario_id");

-- CreateIndex
CREATE INDEX "sessoes_expira_em_idx" ON "sessoes"("expira_em");

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Última linha de defesa (ADR 0007): sessão nunca vence antes de nascer.
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_validade_check" CHECK ("expira_em" > "criada_em");

