-- ============================================================
-- Hermes 1.0
--  1. Estrutura: OS editável (subtotal/desconto/laudo/entrega/cancelamento),
--     quantidade fracionada de peça, kardex (saldo após cada movimento),
--     baixa parcial de parcela, estorno, venda de balcão, sessão por versão.
--  2. Dados: normaliza CPF/CNPJ e telefones (só dígitos), recalcula o
--     subtotal/desconto das OS antigas e reconstrói o saldo do kardex.
-- ============================================================

-- A parcela "ATRASADA" nunca foi gravada (o atraso é calculado na hora),
-- mas o tipo vai perder esse valor: garante que nenhuma linha trave a troca.
UPDATE "contas_receber" SET "status" = 'PENDENTE' WHERE "status"::text = 'ATRASADA';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "FormaPagamento" ADD VALUE 'TRANSFERENCIA';
ALTER TYPE "FormaPagamento" ADD VALUE 'MISTO';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrigemLancamento" ADD VALUE 'RETIRADA';
ALTER TYPE "OrigemLancamento" ADD VALUE 'ESTORNO';

-- AlterEnum
BEGIN;
CREATE TYPE "StatusParcela_new" AS ENUM ('PENDENTE', 'PAGA', 'CANCELADA');
ALTER TABLE "public"."contas_receber" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "contas_receber" ALTER COLUMN "status" TYPE "StatusParcela_new" USING ("status"::text::"StatusParcela_new");
ALTER TYPE "StatusParcela" RENAME TO "StatusParcela_old";
ALTER TYPE "StatusParcela_new" RENAME TO "StatusParcela";
DROP TYPE "public"."StatusParcela_old";
ALTER TABLE "contas_receber" ALTER COLUMN "status" SET DEFAULT 'PENDENTE';
COMMIT;

-- DropIndex
DROP INDEX "lancamentos_caixa_os_id_key";

-- DropIndex
DROP INDEX "movimentos_estoque_peca_id_idx";

-- AlterTable
ALTER TABLE "compra_itens" ALTER COLUMN "quantidade" SET DATA TYPE DECIMAL(10,3);

-- AlterTable
ALTER TABLE "compras" ADD COLUMN     "forma_pagamento" "FormaPagamento",
ADD COLUMN     "vencimento" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "contas_receber" ADD COLUMN     "descricao" TEXT,
ADD COLUMN     "valor_pago" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "despesas" ADD COLUMN     "forma_pagamento" "FormaPagamento",
ADD COLUMN     "pago_em" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "fornecedores" ADD COLUMN     "email" TEXT;

-- AlterTable
ALTER TABLE "lancamentos_caixa" ADD COLUMN     "compra_id" TEXT,
ADD COLUMN     "conta_receber_id" TEXT,
ADD COLUMN     "despesa_id" TEXT,
ADD COLUMN     "venda_id" TEXT;

-- AlterTable
ALTER TABLE "movimentos_estoque" ADD COLUMN     "compra_id" TEXT,
ADD COLUMN     "os_id" TEXT,
ADD COLUMN     "saldo_apos" DECIMAL(12,3),
ADD COLUMN     "usuario_id" TEXT,
ADD COLUMN     "venda_id" TEXT,
ALTER COLUMN "quantidade" SET DATA TYPE DECIMAL(12,3);

-- AlterTable
ALTER TABLE "oficina" ADD COLUMN     "observacoes_documento" TEXT,
ADD COLUMN     "validade_orcamento_dias" INTEGER NOT NULL DEFAULT 15;

-- AlterTable
ALTER TABLE "orcamento_pecas" ALTER COLUMN "quantidade" SET DEFAULT 1,
ALTER COLUMN "quantidade" SET DATA TYPE DECIMAL(10,3);

-- AlterTable
ALTER TABLE "ordens_servico" ADD COLUMN     "cancelada_em" TIMESTAMP(3),
ADD COLUMN     "data_entrega" TIMESTAMP(3),
ADD COLUMN     "defeito_relatado" TEXT,
ADD COLUMN     "desconto" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "motivo_cancelamento" TEXT,
ADD COLUMN     "observacoes" TEXT,
ADD COLUMN     "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "os_pecas" ADD COLUMN     "custo_unit" DECIMAL(10,2),
ALTER COLUMN "quantidade" SET DEFAULT 1,
ALTER COLUMN "quantidade" SET DATA TYPE DECIMAL(10,3);

-- AlterTable
ALTER TABLE "pecas" ALTER COLUMN "margem_pct" SET DATA TYPE DECIMAL(7,2),
ALTER COLUMN "estoque_atual" SET DEFAULT 0,
ALTER COLUMN "estoque_atual" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "estoque_minimo" SET DEFAULT 0,
ALTER COLUMN "estoque_minimo" SET DATA TYPE DECIMAL(12,3);

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "comissao_pct" DECIMAL(5,2),
ADD COLUMN     "sessao_versao" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ultimo_acesso" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "vendas" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cliente_id" TEXT,
    "usuario_id" TEXT,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "desconto" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "forma_pagamento" "FormaPagamento" NOT NULL,
    "observacoes" TEXT,
    "cancelada_em" TIMESTAMP(3),
    "motivo_cancelamento" TEXT,

    CONSTRAINT "vendas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venda_itens" (
    "id" TEXT NOT NULL,
    "venda_id" TEXT NOT NULL,
    "peca_id" TEXT NOT NULL,
    "quantidade" DECIMAL(10,3) NOT NULL,
    "preco_unit" DECIMAL(10,2) NOT NULL,
    "custo_unit" DECIMAL(10,2),

    CONSTRAINT "venda_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendas_numero_key" ON "vendas"("numero");

-- CreateIndex
CREATE INDEX "vendas_data_idx" ON "vendas"("data");

-- CreateIndex
CREATE INDEX "venda_itens_venda_id_idx" ON "venda_itens"("venda_id");

-- CreateIndex
CREATE INDEX "clientes_cpf_cnpj_idx" ON "clientes"("cpf_cnpj");

-- CreateIndex
CREATE INDEX "contas_receber_os_id_idx" ON "contas_receber"("os_id");

-- CreateIndex
CREATE INDEX "lancamentos_caixa_os_id_idx" ON "lancamentos_caixa"("os_id");

-- CreateIndex
CREATE INDEX "lancamentos_caixa_conta_receber_id_idx" ON "lancamentos_caixa"("conta_receber_id");

-- CreateIndex
CREATE INDEX "logs_auditoria_entidade_idx" ON "logs_auditoria"("entidade");

-- CreateIndex
CREATE INDEX "movimentos_estoque_peca_id_data_idx" ON "movimentos_estoque"("peca_id", "data");

-- CreateIndex
CREATE INDEX "orcamentos_status_validade_idx" ON "orcamentos"("status", "validade");

-- CreateIndex
CREATE INDEX "ordens_servico_carro_id_idx" ON "ordens_servico"("carro_id");

-- CreateIndex
CREATE INDEX "ordens_servico_mecanico_id_idx" ON "ordens_servico"("mecanico_id");

-- CreateIndex
CREATE INDEX "ordens_servico_data_abertura_idx" ON "ordens_servico"("data_abertura");

-- CreateIndex
CREATE INDEX "servicos_nome_idx" ON "servicos"("nome");

-- AddForeignKey
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venda_itens" ADD CONSTRAINT "venda_itens_venda_id_fkey" FOREIGN KEY ("venda_id") REFERENCES "vendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venda_itens" ADD CONSTRAINT "venda_itens_peca_id_fkey" FOREIGN KEY ("peca_id") REFERENCES "pecas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_caixa" ADD CONSTRAINT "lancamentos_caixa_conta_receber_id_fkey" FOREIGN KEY ("conta_receber_id") REFERENCES "contas_receber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_caixa" ADD CONSTRAINT "lancamentos_caixa_despesa_id_fkey" FOREIGN KEY ("despesa_id") REFERENCES "despesas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_caixa" ADD CONSTRAINT "lancamentos_caixa_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_caixa" ADD CONSTRAINT "lancamentos_caixa_venda_id_fkey" FOREIGN KEY ("venda_id") REFERENCES "vendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_estoque" ADD CONSTRAINT "movimentos_estoque_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_estoque" ADD CONSTRAINT "movimentos_estoque_os_id_fkey" FOREIGN KEY ("os_id") REFERENCES "ordens_servico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_estoque" ADD CONSTRAINT "movimentos_estoque_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_estoque" ADD CONSTRAINT "movimentos_estoque_venda_id_fkey" FOREIGN KEY ("venda_id") REFERENCES "vendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ============================================================
-- Migração de dados
-- ============================================================

-- CPF/CNPJ e telefones passam a ser guardados sem pontuação (a tela formata).
UPDATE "clientes" SET "cpf_cnpj" = NULLIF(UPPER(REGEXP_REPLACE("cpf_cnpj", '[^0-9A-Za-z]', '', 'g')), '') WHERE "cpf_cnpj" IS NOT NULL;
UPDATE "clientes" SET "telefone" = NULLIF(REGEXP_REPLACE("telefone", '[^0-9]', '', 'g'), '') WHERE "telefone" IS NOT NULL;
UPDATE "clientes" SET "whatsapp" = NULLIF(REGEXP_REPLACE("whatsapp", '[^0-9]', '', 'g'), '') WHERE "whatsapp" IS NOT NULL;
UPDATE "fornecedores" SET "cnpj" = NULLIF(UPPER(REGEXP_REPLACE("cnpj", '[^0-9A-Za-z]', '', 'g')), '') WHERE "cnpj" IS NOT NULL;
UPDATE "fornecedores" SET "telefone" = NULLIF(REGEXP_REPLACE("telefone", '[^0-9]', '', 'g'), '') WHERE "telefone" IS NOT NULL;
UPDATE "oficina" SET "cnpj" = NULLIF(UPPER(REGEXP_REPLACE("cnpj", '[^0-9A-Za-z]', '', 'g')), '') WHERE "cnpj" IS NOT NULL;
UPDATE "oficina" SET "telefone" = NULLIF(REGEXP_REPLACE("telefone", '[^0-9]', '', 'g'), '') WHERE "telefone" IS NOT NULL;
UPDATE "orcamentos" SET "contato_telefone" = NULLIF(REGEXP_REPLACE("contato_telefone", '[^0-9]', '', 'g'), '') WHERE "contato_telefone" IS NOT NULL;

-- OS antigas: subtotal = soma dos itens; desconto = o que o total ficou abaixo dele.
UPDATE "ordens_servico" o SET "subtotal" =
    COALESCE((SELECT SUM(s."quantidade" * s."preco_unit") FROM "os_servicos" s WHERE s."os_id" = o."id"), 0)
  + COALESCE((SELECT SUM(p."quantidade" * p."preco_unit") FROM "os_pecas" p WHERE p."os_id" = o."id"), 0);
UPDATE "ordens_servico" SET "desconto" = GREATEST("subtotal" - "total", 0);

-- Entregue sem data de entrega: usa a conclusão (ou a abertura).
UPDATE "ordens_servico" SET "data_entrega" = COALESCE("data_conclusao", "data_abertura") WHERE "status" = 'ENTREGUE';

-- Custo da peça no momento da baixa: para o histórico, o custo de hoje é a melhor estimativa.
UPDATE "os_pecas" op SET "custo_unit" = p."preco_custo" FROM "pecas" p WHERE p."id" = op."peca_id" AND op."custo_unit" IS NULL;

-- Parcela já recebida: o valor pago é o valor inteiro.
UPDATE "contas_receber" SET "valor_pago" = "valor" WHERE "status" = 'PAGA';

-- Despesa paga: sem a data exata, a melhor estimativa é a própria data da despesa.
UPDATE "despesas" SET "pago_em" = "data" WHERE "pago" = true AND "pago_em" IS NULL;

-- Liga o pagamento das despesas antigas ao lançamento de caixa que ele gerou
-- (mesma descrição, mesmo valor), quando o casamento é inequívoco.
UPDATE "lancamentos_caixa" l SET "despesa_id" = d."id"
FROM "despesas" d
WHERE l."despesa_id" IS NULL AND l."tipo" = 'SAIDA' AND l."origem" = 'DESPESA'
  AND l."descricao" = d."descricao" AND l."valor" = d."valor" AND d."pago" = true
  AND (SELECT COUNT(*) FROM "despesas" d2 WHERE d2."descricao" = d."descricao" AND d2."valor" = d."valor" AND d2."pago" = true) = 1;

-- Kardex: reconstrói o saldo após cada movimento, de trás para frente a partir
-- do estoque atual (o último movimento termina exatamente no saldo de hoje).
WITH m AS (
  SELECT me."id", me."peca_id", me."data",
         CASE me."tipo" WHEN 'SAIDA' THEN -me."quantidade" ELSE me."quantidade" END AS delta
  FROM "movimentos_estoque" me
), acumulado AS (
  SELECT m."id",
         p."estoque_atual" - COALESCE(SUM(m.delta) OVER (
           PARTITION BY m."peca_id" ORDER BY m."data" DESC, m."id" DESC
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS saldo
  FROM m JOIN "pecas" p ON p."id" = m."peca_id"
)
UPDATE "movimentos_estoque" me SET "saldo_apos" = a.saldo FROM acumulado a WHERE a."id" = me."id";
