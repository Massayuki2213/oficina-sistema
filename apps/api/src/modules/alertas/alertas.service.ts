import { prisma } from '../../lib/prisma.js';

// ============================================================
// Alertas ativos — o que a oficina precisa VER sem ir procurar.
// Junta num só lugar o que estava calculado mas escondido:
// RN-02 (estoque baixo), RN-06 (orçamento vencendo),
// RN-11.2 (fiado em atraso) e RN-20 (revisão vencida).
// ============================================================

/** Sem serviço há mais de 6 meses = hora de chamar o cliente de volta (RN-20). */
const MESES_SEM_SERVICO = 6;

/** Orçamento a 3 dias de vencer já merece um telefonema. */
const DIAS_AVISO_VALIDADE = 3;

const num = (v: unknown) => Number(v);
const DIA = 24 * 60 * 60 * 1000;
const diasEntre = (a: Date, b: Date) => Math.floor((a.getTime() - b.getTime()) / DIA);

/**
 * RN-20 — oportunidades de retorno.
 *
 * Carro que já foi atendido e sumiu há mais de 6 meses. É a lista que mais gera
 * dinheiro na oficina: cliente que já confia, veículo que já se conhece.
 *
 * Dois cuidados que fazem a lista ser usável em vez de irritante:
 *  - carro que nunca foi atendido não entra (não é "retorno", é prospecção);
 *  - carro que já tem visita marcada sai da lista — ninguém quer cobrar duas vezes
 *    quem já remarcou.
 */
export async function revisaoVencida(meses = MESES_SEM_SERVICO) {
  const agora = new Date();
  const limite = new Date();
  limite.setMonth(limite.getMonth() - meses);

  const carros = await prisma.carro.findMany({
    where: { ativo: true },
    include: {
      cliente: { select: { id: true, nome: true, telefone: true, whatsapp: true } },
      ordens: {
        where: { status: { in: ['CONCLUIDA', 'ENTREGUE'] } },
        orderBy: { dataAbertura: 'desc' },
        take: 1,
        select: { id: true, numero: true, dataAbertura: true, dataConclusao: true },
      },
      visitas: {
        where: { status: { in: ['AGENDADA', 'CONFIRMADA'] }, dataHora: { gte: agora } },
        select: { id: true },
        take: 1,
      },
    },
  });

  return carros
    .filter((c) => c.ordens.length > 0 && c.visitas.length === 0)
    .map((c) => {
      const ultima = c.ordens[0];
      const quando = ultima.dataConclusao ?? ultima.dataAbertura;
      return {
        carroId: c.id,
        placa: c.placa,
        marca: c.marca,
        modelo: c.modelo,
        kmAtual: c.kmAtual,
        cliente: c.cliente,
        ultimaOS: { id: ultima.id, numero: ultima.numero, data: quando },
        diasSemServico: diasEntre(agora, quando),
      };
    })
    .filter((c) => c.ultimaOS.data < limite)
    .sort((a, b) => b.diasSemServico - a.diasSemServico);
}

/** RN-11.2 — quem está devendo fiado vencido, somado por cliente. */
export async function fiadoEmAtraso() {
  const agora = new Date();
  const parcelas = await prisma.contaReceber.findMany({
    where: { status: 'PENDENTE', vencimento: { lt: agora } },
    include: { cliente: { select: { id: true, nome: true, telefone: true } } },
    orderBy: { vencimento: 'asc' },
  });

  const porCliente = new Map<string, { cliente: (typeof parcelas)[0]['cliente']; valor: number; parcelas: number; maisAntiga: Date }>();
  for (const p of parcelas) {
    const atual = porCliente.get(p.clienteId);
    if (atual) {
      atual.valor += num(p.valor);
      atual.parcelas += 1;
    } else {
      porCliente.set(p.clienteId, { cliente: p.cliente, valor: num(p.valor), parcelas: 1, maisAntiga: p.vencimento });
    }
  }

  return [...porCliente.values()]
    .map((c) => ({ ...c, valor: Number(c.valor.toFixed(2)), diasAtraso: diasEntre(agora, c.maisAntiga) }))
    .sort((a, b) => b.diasAtraso - a.diasAtraso);
}

/** RN-02 — peça no estoque mínimo. A comparação é entre colunas, então filtra aqui. */
export async function estoqueBaixo() {
  const pecas = await prisma.peca.findMany({
    where: { ativo: true },
    select: { id: true, nome: true, estoqueAtual: true, estoqueMinimo: true, unidade: true, localizacao: true },
    orderBy: { nome: 'asc' },
  });
  return pecas.filter((p) => p.estoqueAtual <= p.estoqueMinimo);
}

/** RN-06 — orçamento que vence nos próximos dias e ainda não virou OS. */
export async function orcamentosVencendo(dias = DIAS_AVISO_VALIDADE) {
  const agora = new Date();
  const orcamentos = await prisma.orcamento.findMany({
    where: {
      status: { in: ['RASCUNHO', 'ENVIADO'] },
      validade: { gte: agora, lte: new Date(agora.getTime() + dias * DIA) },
    },
    include: {
      cliente: { select: { id: true, nome: true, telefone: true } },
      carro: { select: { placa: true, modelo: true } },
    },
    orderBy: { validade: 'asc' },
  });

  return orcamentos.map((o) => ({
    id: o.id,
    numero: o.numero,
    cliente: o.cliente,
    carro: o.carro,
    validade: o.validade,
    total: num(o.total),
    diasRestantes: Math.max(0, diasEntre(o.validade, agora)),
  }));
}

/** Tudo de uma vez — é o que o painel do dia consome. */
export async function todosAlertas() {
  const [revisao, fiado, estoque, orcamentos] = await Promise.all([
    revisaoVencida(),
    fiadoEmAtraso(),
    estoqueBaixo(),
    orcamentosVencendo(),
  ]);

  return {
    revisaoVencida: revisao,
    fiadoEmAtraso: fiado,
    estoqueBaixo: estoque,
    orcamentosVencendo: orcamentos,
    total: revisao.length + fiado.length + estoque.length + orcamentos.length,
  };
}

/**
 * RN-11.2 — o cliente pode levar fiado?
 * Usado para travar novo parcelamento de quem já está devendo vencido.
 */
export async function situacaoFiado(clienteId: string) {
  const vencidas = await prisma.contaReceber.findMany({
    where: { clienteId, status: 'PENDENTE', vencimento: { lt: new Date() } },
    orderBy: { vencimento: 'asc' },
  });

  const valor = vencidas.reduce((s, p) => s + num(p.valor), 0);
  return {
    bloqueado: vencidas.length > 0,
    parcelasVencidas: vencidas.length,
    valorVencido: Number(valor.toFixed(2)),
    vencimentoMaisAntigo: vencidas[0]?.vencimento ?? null,
  };
}
