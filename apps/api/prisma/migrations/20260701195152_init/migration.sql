-- CreateEnum
CREATE TYPE "PerfilUsuario" AS ENUM ('DONO', 'ATENDENTE', 'MECANICO');

-- CreateEnum
CREATE TYPE "TipoPessoa" AS ENUM ('PF', 'PJ');

-- CreateEnum
CREATE TYPE "TipoItemEstoque" AS ENUM ('PECA', 'PRODUTO');

-- CreateEnum
CREATE TYPE "StatusOrcamento" AS ENUM ('RASCUNHO', 'ENVIADO', 'APROVADO', 'RECUSADO', 'EXPIRADO');

-- CreateEnum
CREATE TYPE "StatusOS" AS ENUM ('ABERTA', 'EM_EXECUCAO', 'AGUARDANDO_PECA', 'AGUARDANDO_APROVACAO', 'CONCLUIDA', 'ENTREGUE', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoVisita" AS ENUM ('REVISAO', 'RETORNO', 'ORCAMENTO', 'GARANTIA');

-- CreateEnum
CREATE TYPE "StatusVisita" AS ENUM ('AGENDADA', 'CONFIRMADA', 'REALIZADA', 'FALTOU');

-- CreateEnum
CREATE TYPE "TipoLancamento" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "OrigemLancamento" AS ENUM ('OS', 'VENDA_BALCAO', 'DESPESA', 'APORTE');

-- CreateEnum
CREATE TYPE "FormaPagamento" AS ENUM ('A_VISTA', 'PIX', 'CARTAO', 'PARCELADO', 'FIADO');

-- CreateEnum
CREATE TYPE "TipoMovimentoEstoque" AS ENUM ('ENTRADA', 'SAIDA', 'AJUSTE');

-- CreateEnum
CREATE TYPE "StatusParcela" AS ENUM ('PENDENTE', 'PAGA', 'ATRASADA');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "perfil" "PerfilUsuario" NOT NULL DEFAULT 'ATENDENTE',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoPessoa" NOT NULL DEFAULT 'PF',
    "cpf_cnpj" TEXT,
    "telefone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "endereco" TEXT,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "data_cadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carros" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "placa" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "ano" INTEGER,
    "cor" TEXT,
    "km_atual" INTEGER,
    "chassi" TEXT,
    "combustivel" TEXT,
    "observacoes" TEXT,

    CONSTRAINT "carros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicos" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "preco_mao_de_obra" DECIMAL(10,2) NOT NULL,
    "tempo_estimado_min" INTEGER,
    "categoria" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "servicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fornecedores" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "contato" TEXT,
    "telefone" TEXT,
    "prazo_entrega_dias" INTEGER,
    "observacoes" TEXT,

    CONSTRAINT "fornecedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pecas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "sku" TEXT,
    "tipo" "TipoItemEstoque" NOT NULL DEFAULT 'PECA',
    "fornecedor_id" TEXT,
    "preco_custo" DECIMAL(10,2) NOT NULL,
    "preco_venda" DECIMAL(10,2) NOT NULL,
    "margem_pct" DECIMAL(5,2),
    "estoque_atual" INTEGER NOT NULL DEFAULT 0,
    "estoque_minimo" INTEGER NOT NULL DEFAULT 0,
    "unidade" TEXT NOT NULL DEFAULT 'un',
    "localizacao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pecas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamentos" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "carro_id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validade" TIMESTAMP(3) NOT NULL,
    "status" "StatusOrcamento" NOT NULL DEFAULT 'RASCUNHO',
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "observacoes" TEXT,

    CONSTRAINT "orcamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamento_servicos" (
    "id" TEXT NOT NULL,
    "orcamento_id" TEXT NOT NULL,
    "servico_id" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "preco_unit" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "orcamento_servicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamento_pecas" (
    "id" TEXT NOT NULL,
    "orcamento_id" TEXT NOT NULL,
    "peca_id" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "preco_unit" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "orcamento_pecas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordens_servico" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "orcamento_id" TEXT,
    "cliente_id" TEXT NOT NULL,
    "carro_id" TEXT NOT NULL,
    "mecanico_id" TEXT,
    "data_abertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_prevista" TIMESTAMP(3),
    "data_conclusao" TIMESTAMP(3),
    "status" "StatusOS" NOT NULL DEFAULT 'ABERTA',
    "km_entrada" INTEGER,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "forma_pagamento" "FormaPagamento",
    "pago" BOOLEAN NOT NULL DEFAULT false,
    "garantia" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ordens_servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "os_servicos" (
    "id" TEXT NOT NULL,
    "os_id" TEXT NOT NULL,
    "servico_id" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "preco_unit" DECIMAL(10,2) NOT NULL,
    "concluido" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "os_servicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "os_pecas" (
    "id" TEXT NOT NULL,
    "os_id" TEXT NOT NULL,
    "peca_id" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "preco_unit" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "os_pecas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitas" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "carro_id" TEXT,
    "data_hora" TIMESTAMP(3) NOT NULL,
    "tipo" "TipoVisita" NOT NULL DEFAULT 'REVISAO',
    "status" "StatusVisita" NOT NULL DEFAULT 'AGENDADA',
    "observacoes" TEXT,

    CONSTRAINT "visitas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lancamentos_caixa" (
    "id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" "TipoLancamento" NOT NULL,
    "origem" "OrigemLancamento" NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "forma_pagamento" "FormaPagamento",
    "categoria" TEXT,
    "os_id" TEXT,
    "usuario_id" TEXT,

    CONSTRAINT "lancamentos_caixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "despesas" (
    "id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "categoria" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "fornecedor_id" TEXT,
    "recorrente" BOOLEAN NOT NULL DEFAULT false,
    "pago" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "despesas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contas_receber" (
    "id" TEXT NOT NULL,
    "cliente_id" TEXT NOT NULL,
    "os_id" TEXT,
    "parcela" INTEGER NOT NULL DEFAULT 1,
    "total_parcelas" INTEGER NOT NULL DEFAULT 1,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "status" "StatusParcela" NOT NULL DEFAULT 'PENDENTE',
    "pago_em" TIMESTAMP(3),

    CONSTRAINT "contas_receber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentos_estoque" (
    "id" TEXT NOT NULL,
    "peca_id" TEXT NOT NULL,
    "tipo" "TipoMovimentoEstoque" NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "custo_unit" DECIMAL(10,2),
    "motivo" TEXT,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentos_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs_auditoria" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" TEXT,
    "detalhes" TEXT,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "clientes_nome_idx" ON "clientes"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "carros_placa_key" ON "carros"("placa");

-- CreateIndex
CREATE INDEX "carros_cliente_id_idx" ON "carros"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "pecas_sku_key" ON "pecas"("sku");

-- CreateIndex
CREATE INDEX "pecas_nome_idx" ON "pecas"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "orcamentos_numero_key" ON "orcamentos"("numero");

-- CreateIndex
CREATE INDEX "orcamentos_cliente_id_idx" ON "orcamentos"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "ordens_servico_numero_key" ON "ordens_servico"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "ordens_servico_orcamento_id_key" ON "ordens_servico"("orcamento_id");

-- CreateIndex
CREATE INDEX "ordens_servico_status_idx" ON "ordens_servico"("status");

-- CreateIndex
CREATE INDEX "ordens_servico_cliente_id_idx" ON "ordens_servico"("cliente_id");

-- CreateIndex
CREATE INDEX "visitas_data_hora_idx" ON "visitas"("data_hora");

-- CreateIndex
CREATE UNIQUE INDEX "lancamentos_caixa_os_id_key" ON "lancamentos_caixa"("os_id");

-- CreateIndex
CREATE INDEX "lancamentos_caixa_data_idx" ON "lancamentos_caixa"("data");

-- CreateIndex
CREATE INDEX "despesas_data_idx" ON "despesas"("data");

-- CreateIndex
CREATE INDEX "contas_receber_cliente_id_idx" ON "contas_receber"("cliente_id");

-- CreateIndex
CREATE INDEX "contas_receber_vencimento_idx" ON "contas_receber"("vencimento");

-- CreateIndex
CREATE INDEX "movimentos_estoque_peca_id_idx" ON "movimentos_estoque"("peca_id");

-- CreateIndex
CREATE INDEX "logs_auditoria_data_idx" ON "logs_auditoria"("data");

-- AddForeignKey
ALTER TABLE "carros" ADD CONSTRAINT "carros_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pecas" ADD CONSTRAINT "pecas_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_carro_id_fkey" FOREIGN KEY ("carro_id") REFERENCES "carros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_servicos" ADD CONSTRAINT "orcamento_servicos_orcamento_id_fkey" FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_servicos" ADD CONSTRAINT "orcamento_servicos_servico_id_fkey" FOREIGN KEY ("servico_id") REFERENCES "servicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_pecas" ADD CONSTRAINT "orcamento_pecas_orcamento_id_fkey" FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_pecas" ADD CONSTRAINT "orcamento_pecas_peca_id_fkey" FOREIGN KEY ("peca_id") REFERENCES "pecas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_orcamento_id_fkey" FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_carro_id_fkey" FOREIGN KEY ("carro_id") REFERENCES "carros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_mecanico_id_fkey" FOREIGN KEY ("mecanico_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "os_servicos" ADD CONSTRAINT "os_servicos_os_id_fkey" FOREIGN KEY ("os_id") REFERENCES "ordens_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "os_servicos" ADD CONSTRAINT "os_servicos_servico_id_fkey" FOREIGN KEY ("servico_id") REFERENCES "servicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "os_pecas" ADD CONSTRAINT "os_pecas_os_id_fkey" FOREIGN KEY ("os_id") REFERENCES "ordens_servico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "os_pecas" ADD CONSTRAINT "os_pecas_peca_id_fkey" FOREIGN KEY ("peca_id") REFERENCES "pecas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_carro_id_fkey" FOREIGN KEY ("carro_id") REFERENCES "carros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_caixa" ADD CONSTRAINT "lancamentos_caixa_os_id_fkey" FOREIGN KEY ("os_id") REFERENCES "ordens_servico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos_caixa" ADD CONSTRAINT "lancamentos_caixa_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "despesas" ADD CONSTRAINT "despesas_fornecedor_id_fkey" FOREIGN KEY ("fornecedor_id") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_receber" ADD CONSTRAINT "contas_receber_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contas_receber" ADD CONSTRAINT "contas_receber_os_id_fkey" FOREIGN KEY ("os_id") REFERENCES "ordens_servico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_estoque" ADD CONSTRAINT "movimentos_estoque_peca_id_fkey" FOREIGN KEY ("peca_id") REFERENCES "pecas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs_auditoria" ADD CONSTRAINT "logs_auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
