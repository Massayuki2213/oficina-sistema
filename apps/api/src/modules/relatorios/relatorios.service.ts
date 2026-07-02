import { prisma } from '../../lib/prisma.js';

const num = (v: unknown) => Number(v);
const round = (n: number) => Math.round(n * 100) / 100;

function rangeData(de?: string, ate?: string) {
  const gte = de ? new Date(de + 'T00:00:00') : undefined;
  const lte = ate ? new Date(ate + 'T23:59:59.999') : undefined;
  return { gte, lte };
}
function whereEntre(campo: string, de?: string, ate?: string) {
  const { gte, lte } = rangeData(de, ate);
  if (!gte && !lte) return {};
  return { [campo]: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } };
}

// RN-13/14: separa faturamento (o que entrou) do lucro (o que sobrou).
export async function resumoFinanceiro(de?: string, ate?: string) {
  const whereCaixa = whereEntre('data', de, ate);
  const whereOS = whereEntre('dataAbertura', de, ate);

  const [lancamentos, osPecas, ordens] = await Promise.all([
    prisma.lancamentoCaixa.findMany({ where: whereCaixa }),
    prisma.oSPeca.findMany({ where: { os: whereOS }, include: { peca: { select: { precoCusto: true } } } }),
    prisma.ordemServico.findMany({ where: whereOS, select: { total: true } }),
  ]);

  const faturamento = round(lancamentos.filter((l) => l.tipo === 'ENTRADA').reduce((s, l) => s + num(l.valor), 0));
  const despesas = round(lancamentos.filter((l) => l.tipo === 'SAIDA').reduce((s, l) => s + num(l.valor), 0));

  const custoPecasVendidas = round(osPecas.reduce((s, p) => s + p.quantidade * num(p.peca.precoCusto), 0));
  const vendaPecas = round(osPecas.reduce((s, p) => s + p.quantidade * num(p.precoUnit), 0));

  const numOrdens = ordens.length;
  const totalOrdens = ordens.reduce((s, o) => s + num(o.total), 0);

  return {
    periodo: { de: de ?? null, ate: ate ?? null },
    faturamento, // o que entrou no caixa
    despesas, // o que saiu
    lucroCaixa: round(faturamento - despesas), // o que sobrou de verdade (RN-14)
    custoPecasVendidas, // informativo (RN-13)
    lucroBrutoPecas: round(vendaPecas - custoPecasVendidas),
    numOrdens,
    ticketMedio: numOrdens ? round(totalOrdens / numOrdens) : 0,
  };
}

function agrupar<T>(itens: T[], nome: (t: T) => string, qtd: (t: T) => number, receita: (t: T) => number) {
  const m = new Map<string, { nome: string; quantidade: number; receita: number }>();
  for (const it of itens) {
    const k = nome(it);
    const cur = m.get(k) ?? { nome: k, quantidade: 0, receita: 0 };
    cur.quantidade += qtd(it);
    cur.receita += receita(it);
    m.set(k, cur);
  }
  return [...m.values()]
    .map((x) => ({ ...x, receita: round(x.receita) }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 5);
}

// Seção 10: serviços mais vendidos, peças mais usadas, clientes que mais gastam.
export async function rankings(de?: string, ate?: string) {
  const whereOS = whereEntre('dataAbertura', de, ate);

  const [osServ, osPec, ordens] = await Promise.all([
    prisma.oSServico.findMany({ where: { os: whereOS }, include: { servico: { select: { nome: true } } } }),
    prisma.oSPeca.findMany({ where: { os: whereOS }, include: { peca: { select: { nome: true } } } }),
    prisma.ordemServico.findMany({ where: whereOS, include: { cliente: { select: { id: true, nome: true } } } }),
  ]);

  const servicosMaisVendidos = agrupar(osServ, (s) => s.servico.nome, (s) => s.quantidade, (s) => s.quantidade * num(s.precoUnit));
  const pecasMaisUsadas = agrupar(osPec, (p) => p.peca.nome, (p) => p.quantidade, (p) => p.quantidade * num(p.precoUnit));

  const cli = new Map<string, { nome: string; ordens: number; total: number }>();
  for (const o of ordens) {
    const cur = cli.get(o.clienteId) ?? { nome: o.cliente.nome, ordens: 0, total: 0 };
    cur.ordens += 1;
    cur.total += num(o.total);
    cli.set(o.clienteId, cur);
  }
  const clientesTop = [...cli.values()]
    .map((c) => ({ ...c, total: round(c.total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return { servicosMaisVendidos, pecasMaisUsadas, clientesTop };
}

// Despesas por categoria e entradas por origem (para onde vai/de onde vem o dinheiro).
export async function porCategoria(de?: string, ate?: string) {
  const lancamentos = await prisma.lancamentoCaixa.findMany({ where: whereEntre('data', de, ate) });

  const despesasPorCategoria: Record<string, number> = {};
  const entradasPorOrigem: Record<string, number> = {};
  for (const l of lancamentos) {
    if (l.tipo === 'SAIDA') {
      const c = l.categoria ?? 'Sem categoria';
      despesasPorCategoria[c] = round((despesasPorCategoria[c] ?? 0) + num(l.valor));
    } else {
      entradasPorOrigem[l.origem] = round((entradasPorOrigem[l.origem] ?? 0) + num(l.valor));
    }
  }
  return { despesasPorCategoria, entradasPorOrigem };
}
