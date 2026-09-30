import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { CompraDTO, CompraResumoDTO, ContasAPagarDTO, ListaComprasDTO, UsuarioSessao } from '@hermes/shared';
import type { compraSchema, listarComprasQuery, pagarCompraSchema } from '@hermes/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { conflito, invalido, naoEncontrado } from '../../lib/errors.js';
import { multiplicar, num, somar } from '../../lib/dinheiro.js';
import { dataLocal, hojeISO, inicioDoDia, intervalo, isoOuNull } from '../../lib/datas.js';
import { pagina, paginar } from '../../lib/paginacao.js';
import { darEntrada, darSaida, calcularMargem } from '../../dominio/estoque.js';
import { lancar } from '../../dominio/caixa.js';

// ============================================================
// Compras do distribuidor (contas a pagar).
// Os itens dão entrada no estoque ao registrar (e recalculam o custo
// médio, RN-04); o dinheiro só sai do caixa quando a compra é paga —
// regime de caixa, sem contar a peça duas vezes no lucro.
// ============================================================

const incluirResumo = {
  fornecedor: { select: { id: true, nome: true } },
  _count: { select: { itens: true } },
} satisfies Prisma.CompraInclude;

const incluirCompleto = {
  ...incluirResumo,
  itens: { include: { peca: { select: { nome: true, unidade: true } } }, orderBy: { id: 'asc' } },
} satisfies Prisma.CompraInclude;

type CompraResumo = Prisma.CompraGetPayload<{ include: typeof incluirResumo }>;
type CompraCompleta = Prisma.CompraGetPayload<{ include: typeof incluirCompleto }>;

function paraResumo(c: CompraResumo, hoje = inicioDoDia()): CompraResumoDTO {
  return {
    id: c.id,
    numero: c.numero,
    data: c.data.toISOString(),
    vencimento: isoOuNull(c.vencimento),
    numeroNota: c.numeroNota,
    valorTotal: num(c.valorTotal),
    status: c.status,
    pagoEm: isoOuNull(c.pagoEm),
    fornecedor: c.fornecedor,
    qtdItens: c._count.itens,
    vencida: c.status === 'PENDENTE' && !!c.vencimento && c.vencimento < hoje,
  };
}

function paraDTO(c: CompraCompleta): CompraDTO {
  return {
    ...paraResumo(c),
    observacoes: c.observacoes,
    formaPagamento: c.formaPagamento,
    itens: c.itens.map((i) => {
      const quantidade = num(i.quantidade);
      const custoUnit = num(i.custoUnit);
      return {
        id: i.id,
        pecaId: i.pecaId,
        nome: i.peca.nome,
        unidade: i.peca.unidade,
        quantidade,
        custoUnit,
        subtotal: multiplicar(custoUnit, quantidade),
      };
    }),
  };
}

export async function listar(q: z.output<typeof listarComprasQuery>): Promise<ListaComprasDTO> {
  const periodo = intervalo(q.de, q.ate);
  const where: Prisma.CompraWhereInput = {
    ...(periodo ? { data: periodo } : {}),
    ...(q.fornecedorId ? { fornecedorId: q.fornecedorId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.busca
      ? {
          OR: [
            { fornecedor: { nome: { contains: q.busca, mode: 'insensitive' } } },
            { numeroNota: { contains: q.busca } },
            ...(/^\d{1,7}$/.test(q.busca) ? [{ numero: Number(q.busca) }] : []),
          ],
        }
      : {}),
  };
  const [itens, total, soma] = await Promise.all([
    prisma.compra.findMany({ where, orderBy: { data: 'desc' }, include: incluirResumo, ...paginar(q) }),
    prisma.compra.count({ where }),
    prisma.compra.groupBy({ by: ['status'], where, _sum: { valorTotal: true } }),
  ]);
  const aPagar = num(soma.find((s) => s.status === 'PENDENTE')?._sum.valorTotal);
  const pago = num(soma.find((s) => s.status === 'PAGA')?._sum.valorTotal);
  const hoje = inicioDoDia();
  return {
    ...pagina(
      itens.map((c) => paraResumo(c, hoje)),
      total,
      q,
    ),
    totais: { total: somar(aPagar, pago), aPagar, pago },
  };
}

export async function buscar(id: string): Promise<CompraDTO> {
  const c = await prisma.compra.findUnique({ where: { id }, include: incluirCompleto });
  if (!c) throw naoEncontrado('Compra não encontrada');
  return paraDTO(c);
}

const dataInformada = (d?: string | null) => (d && d !== hojeISO() ? dataLocal(d) : undefined);

export async function criar(dados: z.output<typeof compraSchema>, ator: UsuarioSessao): Promise<CompraDTO> {
  const fornecedor = await prisma.fornecedor.findUnique({ where: { id: dados.fornecedorId } });
  if (!fornecedor) throw invalido('Distribuidor não encontrado');
  if (dados.pago && dados.vencimento) throw invalido('Compra paga à vista não tem vencimento');

  const valorTotal = somar(...dados.itens.map((i) => multiplicar(i.custoUnit, i.quantidade)));

  const id = await prisma.$transaction(async (tx) => {
    const compra = await tx.compra.create({
      data: {
        fornecedorId: dados.fornecedorId,
        numeroNota: dados.numeroNota ?? null,
        observacoes: dados.observacoes ?? null,
        valorTotal,
        status: dados.pago ? 'PAGA' : 'PENDENTE',
        pagoEm: dados.pago ? new Date() : null,
        formaPagamento: dados.pago ? (dados.formaPagamento ?? 'A_VISTA') : null,
        vencimento: dados.vencimento ? dataLocal(dados.vencimento) : null,
        ...(dataInformada(dados.data) ? { data: dataInformada(dados.data) } : {}),
      },
    });

    for (const item of dados.itens) {
      // Peça nova nasce zerada; a entrada logo abaixo põe o estoque e o custo.
      let pecaId = item.pecaId;
      if (!pecaId && item.pecaNova) {
        const nova = await tx.peca.create({
          data: {
            nome: item.pecaNova.nome,
            precoCusto: item.custoUnit,
            precoVenda: item.pecaNova.precoVenda,
            margemPct: calcularMargem(item.custoUnit, item.pecaNova.precoVenda),
            unidade: item.pecaNova.unidade,
            codigoBarras: item.pecaNova.codigoBarras ?? null,
            fornecedorId: dados.fornecedorId,
          },
        });
        pecaId = nova.id;
      }
      if (!pecaId) throw invalido('Item de compra sem peça');

      await darEntrada(tx, pecaId, item.quantidade, item.custoUnit, {
        motivo: `Compra #${compra.numero} — ${fornecedor.nome}`,
        compraId: compra.id,
        usuarioId: ator.id,
      });
      await tx.compraItem.create({
        data: { compraId: compra.id, pecaId, quantidade: item.quantidade, custoUnit: item.custoUnit },
      });
    }

    // À vista: já sai do caixa. A prazo: fica como conta a pagar até o acerto.
    if (dados.pago && valorTotal > 0) {
      await lancar(tx, {
        tipo: 'SAIDA',
        origem: 'DESPESA',
        descricao: `Compra #${compra.numero} — ${fornecedor.nome}`,
        valor: valorTotal,
        formaPagamento: dados.formaPagamento ?? 'A_VISTA',
        categoria: 'Compra de peças',
        compraId: compra.id,
        usuarioId: ator.id,
      });
    }
    return compra.id;
  });
  return buscar(id);
}

/** Quanto se deve a cada distribuidor (compras PENDENTE agrupadas). */
export async function contasAPagar(): Promise<ContasAPagarDTO> {
  const hoje = inicioDoDia();
  const pendentes = await prisma.compra.findMany({
    where: { status: 'PENDENTE' },
    include: { fornecedor: { select: { id: true, nome: true, telefone: true } } },
    orderBy: { data: 'asc' },
  });

  const mapa = new Map<string, ContasAPagarDTO['fornecedores'][number]>();
  let totalVencido = 0;
  for (const c of pendentes) {
    const valor = num(c.valorTotal);
    if (c.vencimento && c.vencimento < hoje) totalVencido = somar(totalVencido, valor);

    const atual = mapa.get(c.fornecedorId) ?? {
      fornecedor: c.fornecedor,
      totalDevido: 0,
      compras: 0,
      compraMaisAntiga: c.data.toISOString(),
      proximoVencimento: null,
    };
    atual.totalDevido = somar(atual.totalDevido, valor);
    atual.compras += 1;
    if (c.vencimento && (!atual.proximoVencimento || c.vencimento.toISOString() < atual.proximoVencimento)) {
      atual.proximoVencimento = c.vencimento.toISOString();
    }
    mapa.set(c.fornecedorId, atual);
  }

  const fornecedores = [...mapa.values()].sort((a, b) => b.totalDevido - a.totalDevido);
  return { totalAPagar: somar(...fornecedores.map((f) => f.totalDevido)), totalVencido, fornecedores };
}

/** Paga uma compra a prazo: quita e lança a saída no caixa. */
export async function pagar(id: string, dados: z.output<typeof pagarCompraSchema>, ator: UsuarioSessao) {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.compra.updateMany({
      where: { id, status: 'PENDENTE' },
      data: { status: 'PAGA', pagoEm: new Date(), formaPagamento: dados.formaPagamento },
    });
    if (count === 0) {
      const existe = await tx.compra.count({ where: { id } });
      throw existe ? conflito('Esta compra já foi paga') : naoEncontrado('Compra não encontrada');
    }
    const c = await tx.compra.findUniqueOrThrow({ where: { id }, include: { fornecedor: { select: { nome: true } } } });
    await lancar(tx, {
      tipo: 'SAIDA',
      origem: 'DESPESA',
      descricao: `Compra #${c.numero} — ${c.fornecedor.nome}`,
      valor: num(c.valorTotal),
      formaPagamento: dados.formaPagamento,
      categoria: 'Compra de peças',
      compraId: id,
      usuarioId: ator.id,
    });
  });
  return buscar(id);
}

/** Acerto do mês: quita todas as compras em aberto de um distribuidor de uma vez. */
export async function quitarFornecedor(fornecedorId: string, dados: z.output<typeof pagarCompraSchema>, ator: UsuarioSessao) {
  const fornecedor = await prisma.fornecedor.findUnique({ where: { id: fornecedorId } });
  if (!fornecedor) throw naoEncontrado('Distribuidor não encontrado');

  return prisma.$transaction(async (tx) => {
    const pendentes = await tx.compra.findMany({ where: { fornecedorId, status: 'PENDENTE' }, orderBy: { numero: 'asc' } });
    if (pendentes.length === 0) throw conflito('Este distribuidor não tem compras em aberto');
    const total = somar(...pendentes.map((c) => num(c.valorTotal)));

    await tx.compra.updateMany({
      where: { id: { in: pendentes.map((c) => c.id) } },
      data: { status: 'PAGA', pagoEm: new Date(), formaPagamento: dados.formaPagamento },
    });
    // Um lançamento só, para o caixa não encher de linhas no acerto.
    await lancar(tx, {
      tipo: 'SAIDA',
      origem: 'DESPESA',
      descricao: `Acerto — ${fornecedor.nome} (compras ${pendentes.map((c) => `#${c.numero}`).join(', ')})`,
      valor: total,
      formaPagamento: dados.formaPagamento,
      categoria: 'Compra de peças',
      usuarioId: ator.id,
    });
    return { quitadas: pendentes.length, total };
  });
}

/** Exclui uma compra a prazo, estornando o estoque. Compra paga não se apaga. */
export async function excluir(id: string, ator: UsuarioSessao) {
  await prisma.$transaction(async (tx) => {
    const compra = await tx.compra.findUnique({ where: { id }, include: { itens: true } });
    if (!compra) throw naoEncontrado('Compra não encontrada');
    if (compra.status === 'PAGA') throw conflito('Compra paga não pode ser apagada (já saiu do caixa)');

    for (const item of compra.itens) {
      await darSaida(tx, item.pecaId, num(item.quantidade), {
        motivo: `Estorno da compra #${compra.numero}`,
        usuarioId: ator.id,
      });
    }
    await tx.compra.delete({ where: { id } }); // itens saem por cascade
  });
}
