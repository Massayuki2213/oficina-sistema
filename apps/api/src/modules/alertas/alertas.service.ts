import type { Prisma } from '@prisma/client';
import type {
  AlertasDTO,
  CompraVencendoDTO,
  EstoqueBaixoDTO,
  FiadoAtrasoDTO,
  OrcamentoVencendoDTO,
  OSResumoDTO,
  RevisaoVencidaDTO,
  UsuarioSessao,
} from '@hermes/shared';
import { prisma } from '../../lib/prisma.js';
import { num, somar } from '../../lib/dinheiro.js';
import { adicionarDias, diasEntre, fimDoDia, inicioDoDia } from '../../lib/datas.js';
import { saldoParcela } from '../../dominio/fiado.js';
import { incluirOSResumo, paraOSResumo } from '../ordens/ordens.mapper.js';

// ============================================================
// Alertas ativos — o que a oficina precisa VER sem ir procurar:
// RN-02 (estoque baixo), RN-06 (orçamento vencendo), RN-11.2 (fiado
// em atraso), RN-20 (revisão vencida), OS passando da previsão e
// boleto de distribuidor vencendo. Cada perfil recebe só o que pode
// resolver.
// ============================================================

/** Sem serviço há mais de 6 meses = hora de chamar o cliente de volta (RN-20). */
const MESES_SEM_SERVICO = 6;
/** Orçamento a 3 dias de vencer já merece um telefonema. */
const DIAS_AVISO_ORCAMENTO = 3;
/** Boleto do distribuidor: avisa com uma semana de folga. */
const DIAS_AVISO_COMPRA = 7;

/**
 * RN-20 — oportunidades de retorno: carro que já foi atendido e sumiu.
 * É a lista que mais gera dinheiro: cliente que já confia, carro que já se conhece.
 *
 * Para ser usável em vez de irritante:
 *  - carro que nunca foi atendido não entra (não é retorno, é prospecção);
 *  - carro com visita marcada ou com OS aberta agora sai da lista.
 */
export async function revisaoVencida(meses = MESES_SEM_SERVICO): Promise<RevisaoVencidaDTO[]> {
  const limite = new Date();
  limite.setMonth(limite.getMonth() - meses);

  const linhas = await prisma.$queryRaw<
    {
      carro_id: string;
      placa: string;
      marca: string;
      modelo: string;
      km_atual: number | null;
      cliente_id: string;
      cliente_nome: string;
      telefone: string | null;
      whatsapp: string | null;
      os_id: string;
      os_numero: number;
      os_data: Date;
    }[]
  >`
    SELECT c.id AS carro_id, c.placa, c.marca, c.modelo, c.km_atual,
           cl.id AS cliente_id, cl.nome AS cliente_nome, cl.telefone, cl.whatsapp,
           u.id AS os_id, u.numero AS os_numero, u.data AS os_data
    FROM carros c
    JOIN clientes cl ON cl.id = c.cliente_id
    JOIN LATERAL (
      SELECT o.id, o.numero, COALESCE(o.data_conclusao, o.data_abertura) AS data
      FROM ordens_servico o
      WHERE o.carro_id = c.id AND o.status IN ('CONCLUIDA', 'ENTREGUE')
      ORDER BY o.data_abertura DESC
      LIMIT 1
    ) u ON true
    WHERE c.ativo AND cl.ativo AND u.data < ${limite}
      AND NOT EXISTS (
        SELECT 1 FROM visitas v
        WHERE v.carro_id = c.id AND v.status IN ('AGENDADA', 'CONFIRMADA') AND v.data_hora >= now()
      )
      AND NOT EXISTS (
        SELECT 1 FROM ordens_servico o2
        WHERE o2.carro_id = c.id AND o2.status IN ('ABERTA', 'EM_EXECUCAO', 'AGUARDANDO_PECA', 'AGUARDANDO_APROVACAO')
      )
    ORDER BY u.data ASC
    LIMIT 200`;

  const agora = new Date();
  return linhas.map((l) => ({
    carroId: l.carro_id,
    placa: l.placa,
    marca: l.marca,
    modelo: l.modelo,
    kmAtual: l.km_atual,
    cliente: { id: l.cliente_id, nome: l.cliente_nome, telefone: l.telefone, whatsapp: l.whatsapp },
    ultimaOS: { id: l.os_id, numero: l.os_numero, data: l.os_data.toISOString() },
    diasSemServico: diasEntre(agora, l.os_data),
  }));
}

/** RN-11.2 — quem está devendo fiado vencido, somado por cliente. */
export async function fiadoEmAtraso(): Promise<FiadoAtrasoDTO[]> {
  const hoje = inicioDoDia();
  const parcelas = await prisma.contaReceber.findMany({
    where: { status: 'PENDENTE', vencimento: { lt: hoje } },
    include: { cliente: { select: { id: true, nome: true, telefone: true, whatsapp: true } } },
    orderBy: { vencimento: 'asc' },
  });

  const porCliente = new Map<string, FiadoAtrasoDTO & { maisAntiga: Date }>();
  for (const p of parcelas) {
    const atual = porCliente.get(p.clienteId);
    if (atual) {
      atual.valor = somar(atual.valor, saldoParcela(p));
      atual.parcelas += 1;
    } else {
      porCliente.set(p.clienteId, { cliente: p.cliente, valor: saldoParcela(p), parcelas: 1, diasAtraso: 0, maisAntiga: p.vencimento });
    }
  }
  return [...porCliente.values()]
    .map(({ maisAntiga, ...c }) => ({ ...c, diasAtraso: diasEntre(hoje, maisAntiga) }))
    .sort((a, b) => b.diasAtraso - a.diasAtraso);
}

/** RN-02 — peça no estoque mínimo. A comparação é entre colunas: SQL direto. */
export async function estoqueBaixo(): Promise<EstoqueBaixoDTO[]> {
  const linhas = await prisma.$queryRaw<
    { id: string; nome: string; estoque_atual: Prisma.Decimal; estoque_minimo: Prisma.Decimal; unidade: string; localizacao: string | null }[]
  >`
    SELECT id, nome, estoque_atual, estoque_minimo, unidade, localizacao
    FROM pecas WHERE ativo AND estoque_atual <= estoque_minimo
    ORDER BY (estoque_atual - estoque_minimo) ASC, nome ASC
    LIMIT 200`;
  return linhas.map((p) => ({
    id: p.id,
    nome: p.nome,
    estoqueAtual: num(p.estoque_atual),
    estoqueMinimo: num(p.estoque_minimo),
    unidade: p.unidade,
    localizacao: p.localizacao,
  }));
}

/** RN-06 — orçamento que vence nos próximos dias e ainda não virou OS. */
export async function orcamentosVencendo(dias = DIAS_AVISO_ORCAMENTO): Promise<OrcamentoVencendoDTO[]> {
  const agora = new Date();
  const orcamentos = await prisma.orcamento.findMany({
    where: { status: { in: ['RASCUNHO', 'ENVIADO'] }, validade: { gte: agora, lte: fimDoDia(adicionarDias(agora, dias)) } },
    include: {
      cliente: { select: { id: true, nome: true, telefone: true, whatsapp: true } },
      carro: { select: { placa: true, modelo: true } },
    },
    orderBy: { validade: 'asc' },
    take: 100,
  });
  return orcamentos.map((o) => ({
    id: o.id,
    numero: o.numero,
    cliente: o.cliente,
    contatoNome: o.contatoNome,
    contatoTelefone: o.contatoTelefone,
    carro: o.carro,
    validade: o.validade.toISOString(),
    total: num(o.total),
    diasRestantes: Math.max(0, diasEntre(o.validade, agora)),
  }));
}

/** Carro que passou da previsão de entrega e ainda está sendo feito. */
export async function osAtrasadas(ator: UsuarioSessao): Promise<OSResumoDTO[]> {
  const os = await prisma.ordemServico.findMany({
    where: {
      dataPrevista: { lt: new Date() },
      status: { in: ['ABERTA', 'EM_EXECUCAO', 'AGUARDANDO_PECA', 'AGUARDANDO_APROVACAO'] },
      ...(ator.permissoes.verTodasOS ? {} : { mecanicoId: ator.id }),
    },
    include: incluirOSResumo,
    orderBy: { dataPrevista: 'asc' },
    take: 100,
  });
  return os.map(paraOSResumo);
}

/** Boleto de distribuidor vencido ou vencendo na semana. */
export async function comprasVencendo(dias = DIAS_AVISO_COMPRA): Promise<CompraVencendoDTO[]> {
  const hoje = inicioDoDia();
  const compras = await prisma.compra.findMany({
    where: { status: 'PENDENTE', vencimento: { not: null, lte: fimDoDia(adicionarDias(hoje, dias)) } },
    include: { fornecedor: { select: { nome: true } } },
    orderBy: { vencimento: 'asc' },
    take: 100,
  });
  return compras.map((c) => ({
    id: c.id,
    numero: c.numero,
    fornecedor: c.fornecedor.nome,
    valorTotal: num(c.valorTotal),
    vencimento: c.vencimento!.toISOString(),
    diasParaVencer: diasEntre(c.vencimento!, hoje),
  }));
}

/** Tudo de uma vez — é o que o painel do dia consome. */
export async function todos(ator: UsuarioSessao): Promise<AlertasDTO> {
  const p = ator.permissoes;
  const [estoque, atrasadas, revisao, orcamentos, fiado, compras] = await Promise.all([
    estoqueBaixo(),
    osAtrasadas(ator),
    p.atender ? revisaoVencida() : null,
    p.atender ? orcamentosVencendo() : null,
    p.receberPagamentos ? fiadoEmAtraso() : null,
    p.verFinanceiro ? comprasVencendo() : null,
  ]);

  return {
    estoqueBaixo: estoque,
    osAtrasadas: atrasadas,
    revisaoVencida: revisao,
    orcamentosVencendo: orcamentos,
    fiadoEmAtraso: fiado,
    comprasVencendo: compras,
    total:
      estoque.length +
      atrasadas.length +
      (revisao?.length ?? 0) +
      (orcamentos?.length ?? 0) +
      (fiado?.length ?? 0) +
      (compras?.length ?? 0),
  };
}
