-- O horário da agenda guarda o atendimento que nasceu dele: quando o cliente
-- chega, o balcão abre o orçamento (ou a OS) direto do horário, e o quadro do
-- dia mostra o número. Horários antigos ficam sem vínculo.

-- AlterTable
ALTER TABLE "visitas" ADD COLUMN     "orcamento_id" TEXT,
ADD COLUMN     "os_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "visitas_orcamento_id_key" ON "visitas"("orcamento_id");

-- CreateIndex
CREATE UNIQUE INDEX "visitas_os_id_key" ON "visitas"("os_id");

-- AddForeignKey
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_orcamento_id_fkey" FOREIGN KEY ("orcamento_id") REFERENCES "orcamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitas" ADD CONSTRAINT "visitas_os_id_fkey" FOREIGN KEY ("os_id") REFERENCES "ordens_servico"("id") ON DELETE SET NULL ON UPDATE CASCADE;
