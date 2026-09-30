-- ============================================================
-- Concorrência otimista (ADR 0010): cada registro editado por
-- formulário ganha uma versão, que sobe a cada gravação. A tela manda
-- a versão que carregou; se alguém salvou no meio, a API recusa
-- (409 CONFLITO_EDICAO) em vez de apagar o trabalho do outro.
-- ============================================================

-- AlterTable
ALTER TABLE "carros" ADD COLUMN     "versao" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "versao" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "despesas" ADD COLUMN     "versao" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "fornecedores" ADD COLUMN     "versao" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "oficina" ADD COLUMN     "versao" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orcamentos" ADD COLUMN     "versao" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ordens_servico" ADD COLUMN     "versao" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "pecas" ADD COLUMN     "versao" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "servicos" ADD COLUMN     "versao" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "versao" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "visitas" ADD COLUMN     "versao" INTEGER NOT NULL DEFAULT 0;

