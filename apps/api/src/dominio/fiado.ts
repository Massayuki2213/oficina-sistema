import type { Prisma, PrismaClient } from '@prisma/client';
import type { SituacaoFiadoDTO } from '@hermes/shared';
import { dividirEmParcelas, num, somar, subtrair } from '../lib/dinheiro.js';
import { adicionarMeses, dataLocal, inicioDoDia, isoOuNull } from '../lib/datas.js';

// ============================================================
// Fiado e parcelado (RN-11.1 / RN-11.2).
// ============================================================

type Db = Prisma.TransactionClient | PrismaClient;

/** Saldo de uma parcela: o que falta receber dela (aceita baixa parcial). */
export const saldoParcela = (p: { valor: unknown; valorPago: unknown }) =>
  subtrair(num(p.valor as string), num(p.valorPago as string));

/**
 * RN-11.2 — quanto o cliente deve e se está em atraso.
 * Parcela que vence hoje ainda não está atrasada: vira atraso amanhã.
 */
export async function situacaoFiado(db: Db, clienteId: string): Promise<SituacaoFiadoDTO> {
  const pendentes = await db.contaReceber.findMany({
    where: { clienteId, status: 'PENDENTE' },
    orderBy: { vencimento: 'asc' },
    select: { valor: true, valorPago: true, vencimento: true },
  });
  const hoje = inicioDoDia();
  const vencidas = pendentes.filter((p) => p.vencimento < hoje);

  return {
    emAberto: somar(...pendentes.map(saldoParcela)),
    vencido: somar(...vencidas.map(saldoParcela)),
    parcelasVencidas: vencidas.length,
    bloqueado: vencidas.length > 0,
    vencimentoMaisAntigo: isoOuNull(vencidas[0]?.vencimento),
  };
}

/**
 * Cria as parcelas de um valor a prazo. Vencem sempre no mesmo dia do mês
 * (31/01 → 28/02 → 31/03), e somam exatamente o total: o centavo que sobra
 * da divisão vai para a última.
 */
export async function gerarParcelas(
  tx: Prisma.TransactionClient,
  dados: {
    clienteId: string;
    osId?: string | null;
    descricao?: string | null;
    total: number;
    parcelas: number;
    /** "AAAA-MM-DD" */
    primeiroVencimento: string;
  },
) {
  const valores = dividirEmParcelas(dados.total, dados.parcelas);
  const primeiro = dataLocal(dados.primeiroVencimento);

  await tx.contaReceber.createMany({
    data: valores.map((valor, i) => ({
      clienteId: dados.clienteId,
      osId: dados.osId ?? null,
      descricao: dados.descricao ?? null,
      parcela: i + 1,
      totalParcelas: dados.parcelas,
      vencimento: adicionarMeses(primeiro, i),
      valor,
    })),
  });
  return valores;
}

/** Quando a última parcela de uma OS é recebida, a OS passa a constar como paga. */
export async function atualizarQuitacaoDaOS(tx: Prisma.TransactionClient, osId: string) {
  const pendentes = await tx.contaReceber.count({ where: { osId, status: 'PENDENTE' } });
  await tx.ordemServico.update({ where: { id: osId }, data: { pago: pendentes === 0 } });
  return pendentes === 0;
}
