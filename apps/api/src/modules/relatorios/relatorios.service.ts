import type { Prisma } from '@prisma/client';
import type {
  MesEvolucaoDTO,
  PorCategoriaDTO,
  ProdutividadeDTO,
  RankingsDTO,
  RelatorioEstoqueDTO,
  ResumoFinanceiroDTO,
} from '@hermes/shared';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../lib/env.js';
import { multiplicar, num, somar, subtrair } from '../../lib/dinheiro.js';
import { adicionarDias, intervalo, mesISO } from '../../lib/datas.js';

// ============================================================
// Relatórios do Dono (seção 10 do PLANEJAMENTO).
//
// RN-13/14: faturamento é o que ENTROU da operação; lucro é o que
// SOBROU. Regime de caixa: a peça comprada já saiu como despesa
// quando foi paga ao distribuidor — por isso o custo da peça vendida
// é publicado à parte (margem), e não descontado de novo do lucro.
//
// Aporte (dinheiro que o dono pôs) e retirada (o que ele tirou) mexem
// no caixa, mas não são receita nem despesa da oficina.
// ============================================================

type Periodo = { de?: string; ate?: string };

/** Filtro de OS entregues no período (o serviço que efetivamente "vendeu"). */
function osEntregues(p: Periodo): Prisma.OrdemServicoWhereInput {
  const periodo = intervalo(p.de, p.ate);
  return { status: 'ENTREGUE', garantia: false, ...(periodo ? { dataEntrega: periodo } : {}) };
}

export async function resumo(p: Periodo): Promise<ResumoFinanceiroDTO> {
  const periodo = intervalo(p.de, p.ate);
  const whereCaixa = periodo ? { data: periodo } : {};
  const whereVendas: Prisma.VendaWhereInput = { canceladaEm: null, ...(periodo ? { data: periodo } : {}) };

  const [grupos, ordens, osPecas, osServicos, vendaItens] = await Promise.all([
    prisma.lancamentoCaixa.groupBy({ by: ['tipo', 'origem'], where: whereCaixa, _sum: { valor: true } }),
    prisma.ordemServico.aggregate({ where: osEntregues(p), _sum: { total: true }, _count: true }),
    prisma.oSPeca.findMany({
      where: { os: osEntregues(p) },
      select: { quantidade: true, precoUnit: true, custoUnit: true, peca: { select: { precoCusto: true } } },
    }),
    prisma.oSServico.findMany({ where: { os: osEntregues(p) }, select: { quantidade: true, precoUnit: true } }),
    prisma.vendaItem.findMany({
      where: { venda: whereVendas },
      select: { quantidade: true, precoUnit: true, custoUnit: true, peca: { select: { precoCusto: true } } },
    }),
  ]);

  const soma = (tipo: 'ENTRADA' | 'SAIDA', ...origens: string[]) =>
    somar(...grupos.filter((g) => g.tipo === tipo && origens.includes(g.origem)).map((g) => num(g._sum.valor)));

  const estornos = soma('SAIDA', 'ESTORNO');
  const faturamento = subtrair(soma('ENTRADA', 'OS', 'VENDA_BALCAO'), estornos);
  const despesas = soma('SAIDA', 'DESPESA');

  // Custo "congelado" na baixa; linhas antigas sem ele usam o custo de hoje.
  const itensPeca = [...osPecas, ...vendaItens];
  const receitaPecas = somar(...itensPeca.map((i) => multiplicar(num(i.precoUnit), num(i.quantidade))));
  const custoPecasVendidas = somar(
    ...itensPeca.map((i) => multiplicar(num(i.custoUnit ?? i.peca.precoCusto), num(i.quantidade))),
  );

  const numOrdens = ordens._count;
  return {
    periodo: { de: p.de ?? null, ate: p.ate ?? null },
    faturamento,
    despesas,
    lucro: subtrair(faturamento, despesas),
    aportes: soma('ENTRADA', 'APORTE'),
    retiradas: soma('SAIDA', 'RETIRADA'),
    estornos,
    receitaPecas,
    custoPecasVendidas,
    lucroBrutoPecas: subtrair(receitaPecas, custoPecasVendidas),
    receitaServicos: somar(...osServicos.map((s) => multiplicar(num(s.precoUnit), s.quantidade))),
    vendasBalcao: soma('ENTRADA', 'VENDA_BALCAO'),
    numOrdens,
    ticketMedio: numOrdens ? Math.round((num(ordens._sum.total) / numOrdens) * 100) / 100 : 0,
  };
}

/** Faturamento, despesa e lucro mês a mês — o "como estamos indo". */
export async function evolucao(meses: number): Promise<{ meses: MesEvolucaoDTO[] }> {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - (meses - 1), 1);

  // Os horários estão em UTC no banco; o mês é o do fuso da oficina.
  const [caixa, ordens] = await Promise.all([
    prisma.$queryRaw<{ mes: string; receita: Prisma.Decimal; estornos: Prisma.Decimal; despesas: Prisma.Decimal }[]>`
      SELECT to_char(date_trunc('month', (data AT TIME ZONE 'UTC') AT TIME ZONE ${env.TZ}), 'YYYY-MM') AS mes,
             SUM(CASE WHEN tipo = 'ENTRADA' AND origem IN ('OS', 'VENDA_BALCAO') THEN valor ELSE 0 END) AS receita,
             SUM(CASE WHEN tipo = 'SAIDA' AND origem = 'ESTORNO' THEN valor ELSE 0 END) AS estornos,
             SUM(CASE WHEN tipo = 'SAIDA' AND origem = 'DESPESA' THEN valor ELSE 0 END) AS despesas
      FROM lancamentos_caixa WHERE data >= ${inicio}
      GROUP BY 1`,
    prisma.$queryRaw<{ mes: string; qtd: bigint }[]>`
      SELECT to_char(date_trunc('month', (data_entrega AT TIME ZONE 'UTC') AT TIME ZONE ${env.TZ}), 'YYYY-MM') AS mes,
             COUNT(*) AS qtd
      FROM ordens_servico
      WHERE status = 'ENTREGUE' AND garantia = false AND data_entrega >= ${inicio}
      GROUP BY 1`,
  ]);

  const lista: MesEvolucaoDTO[] = [];
  for (let i = 0; i < meses; i++) {
    const mes = mesISO(new Date(inicio.getFullYear(), inicio.getMonth() + i, 1));
    const c = caixa.find((x) => x.mes === mes);
    const faturamento = c ? subtrair(num(c.receita), num(c.estornos)) : 0;
    const despesas = c ? num(c.despesas) : 0;
    lista.push({
      mes,
      faturamento,
      despesas,
      lucro: subtrair(faturamento, despesas),
      numOrdens: Number(ordens.find((o) => o.mes === mes)?.qtd ?? 0),
    });
  }
  return { meses: lista };
}

function top<T>(itens: T[], chave: (t: T) => string, qtd: (t: T) => number, receita: (t: T) => number) {
  const m = new Map<string, { nome: string; quantidade: number; receita: number }>();
  for (const it of itens) {
    const k = chave(it);
    const atual = m.get(k) ?? { nome: k, quantidade: 0, receita: 0 };
    atual.quantidade += qtd(it);
    atual.receita = somar(atual.receita, receita(it));
    m.set(k, atual);
  }
  return [...m.values()].sort((a, b) => b.quantidade - a.quantidade).slice(0, 10);
}

/** Seção 10: serviços mais vendidos, peças mais usadas, clientes que mais gastam. */
export async function rankings(p: Periodo): Promise<RankingsDTO> {
  const where = osEntregues(p);
  const [servicos, pecas, ordens] = await Promise.all([
    prisma.oSServico.findMany({ where: { os: where }, include: { servico: { select: { nome: true } } } }),
    prisma.oSPeca.findMany({ where: { os: where }, include: { peca: { select: { nome: true } } } }),
    prisma.ordemServico.findMany({ where, select: { total: true, cliente: { select: { id: true, nome: true } } } }),
  ]);

  const clientes = new Map<string, { id: string; nome: string; ordens: number; total: number }>();
  for (const o of ordens) {
    const atual = clientes.get(o.cliente.id) ?? { id: o.cliente.id, nome: o.cliente.nome, ordens: 0, total: 0 };
    atual.ordens += 1;
    atual.total = somar(atual.total, num(o.total));
    clientes.set(o.cliente.id, atual);
  }

  return {
    servicosMaisVendidos: top(
      servicos,
      (s) => s.servico.nome,
      (s) => s.quantidade,
      (s) => multiplicar(num(s.precoUnit), s.quantidade),
    ),
    pecasMaisUsadas: top(
      pecas,
      (x) => x.peca.nome,
      (x) => num(x.quantidade),
      (x) => multiplicar(num(x.precoUnit), num(x.quantidade)),
    ),
    clientesTop: [...clientes.values()].sort((a, b) => b.total - a.total).slice(0, 10),
  };
}

/** Para onde vai o dinheiro (despesas por categoria) e de onde vem (entradas por origem). */
export async function porCategoria(p: Periodo): Promise<PorCategoriaDTO> {
  const periodo = intervalo(p.de, p.ate);
  const where = periodo ? { data: periodo } : {};
  const [despesas, entradas] = await Promise.all([
    prisma.lancamentoCaixa.groupBy({
      by: ['categoria'],
      where: { ...where, tipo: 'SAIDA', origem: 'DESPESA' },
      _sum: { valor: true },
    }),
    prisma.lancamentoCaixa.groupBy({ by: ['origem'], where: { ...where, tipo: 'ENTRADA' }, _sum: { valor: true } }),
  ]);
  return {
    despesasPorCategoria: Object.fromEntries(despesas.map((d) => [d.categoria ?? 'Sem categoria', num(d._sum.valor)])),
    entradasPorOrigem: Object.fromEntries(entradas.map((e) => [e.origem, num(e._sum.valor)])),
  };
}

/**
 * Produtividade por mecânico: OS concluídas no período, mão de obra que elas
 * renderam e a comissão (quando o mecânico tem % cadastrado).
 */
export async function produtividade(p: Periodo): Promise<ProdutividadeDTO> {
  const periodo = intervalo(p.de, p.ate);
  const [mecanicos, ordens] = await Promise.all([
    prisma.usuario.findMany({ where: { perfil: 'MECANICO' }, select: { id: true, nome: true, comissaoPct: true, ativo: true } }),
    prisma.ordemServico.findMany({
      where: {
        mecanicoId: { not: null },
        garantia: false,
        status: { in: ['CONCLUIDA', 'ENTREGUE'] },
        ...(periodo ? { dataConclusao: periodo } : {}),
      },
      select: {
        mecanicoId: true,
        dataAbertura: true,
        dataConclusao: true,
        servicos: { select: { quantidade: true, precoUnit: true } },
      },
    }),
  ]);

  return {
    mecanicos: mecanicos
      .map((m) => {
        const minhas = ordens.filter((o) => o.mecanicoId === m.id);
        const receitaServicos = somar(
          ...minhas.flatMap((o) => o.servicos.map((s) => multiplicar(num(s.precoUnit), s.quantidade))),
        );
        const horas = minhas
          .filter((o) => o.dataConclusao)
          .map((o) => (o.dataConclusao!.getTime() - o.dataAbertura.getTime()) / 3_600_000);
        const pct = m.comissaoPct == null ? null : num(m.comissaoPct);
        return {
          id: m.id,
          nome: m.nome,
          comissaoPct: pct,
          ordens: minhas.length,
          receitaServicos,
          comissao: pct ? Math.round(receitaServicos * pct) / 100 : 0,
          tempoMedioHoras: horas.length ? Math.round((horas.reduce((a, b) => a + b, 0) / horas.length) * 10) / 10 : null,
          ativo: m.ativo,
        };
      })
      // Mecânico inativo só aparece se trabalhou no período.
      .filter((m) => m.ativo || m.ordens > 0)
      .map(({ ativo: _ativo, ...m }) => m)
      .sort((a, b) => b.receitaServicos - a.receitaServicos),
  };
}

/** Quanto dinheiro está parado na prateleira, e em quê. */
export async function estoque(): Promise<RelatorioEstoqueDTO> {
  const limiteParado = adicionarDias(new Date(), -90);
  const [totais, parados] = await Promise.all([
    prisma.$queryRaw<{ valor: Prisma.Decimal | null; itens: bigint; baixos: bigint }[]>`
      SELECT SUM(GREATEST(estoque_atual, 0) * preco_custo) AS valor,
             COUNT(*) AS itens,
             COUNT(*) FILTER (WHERE estoque_atual <= estoque_minimo) AS baixos
      FROM pecas WHERE ativo`,
    prisma.$queryRaw<
      { id: string; nome: string; estoque_atual: Prisma.Decimal; unidade: string; preco_custo: Prisma.Decimal; ultima_saida: Date | null }[]
    >`
      SELECT p.id, p.nome, p.estoque_atual, p.unidade, p.preco_custo,
             (SELECT MAX(m.data) FROM movimentos_estoque m WHERE m.peca_id = p.id AND m.tipo = 'SAIDA') AS ultima_saida
      FROM pecas p
      WHERE p.ativo AND p.estoque_atual > 0
        AND NOT EXISTS (
          SELECT 1 FROM movimentos_estoque m
          WHERE m.peca_id = p.id AND m.tipo = 'SAIDA' AND m.data >= ${limiteParado}
        )
      ORDER BY p.estoque_atual * p.preco_custo DESC
      LIMIT 50`,
  ]);

  const t = totais[0];
  return {
    valorEstoque: num(t?.valor ?? 0),
    itensAtivos: Number(t?.itens ?? 0),
    abaixoMinimo: Number(t?.baixos ?? 0),
    parados: parados.map((p) => ({
      id: p.id,
      nome: p.nome,
      estoqueAtual: num(p.estoque_atual),
      unidade: p.unidade,
      valorParado: multiplicar(num(p.preco_custo), num(p.estoque_atual)),
      ultimaSaida: p.ultima_saida ? p.ultima_saida.toISOString() : null,
    })),
  };
}
