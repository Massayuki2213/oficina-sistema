import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { MovimentoEstoqueDTO, Pagina, PecaDTO, UsuarioSessao } from '@hermes/shared';
import type {
  ajusteEstoqueSchema,
  criarPecaSchema,
  entradaEstoqueSchema,
  listarPecasQuery,
  movimentosQuery,
  pecaSchema,
} from '@hermes/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { naoEncontrado, semPermissao } from '../../lib/errors.js';
import { falhaDeVersao, naVersao, proximaVersao } from '../../lib/versao.js';
import { num, numOuNull } from '../../lib/dinheiro.js';
import { pagina, paginar } from '../../lib/paginacao.js';
import { ajustar, calcularMargem, darEntrada } from '../../dominio/estoque.js';

const incluirFornecedor = { fornecedor: { select: { id: true, nome: true } } } as const;
type PecaComFornecedor = Prisma.PecaGetPayload<{ include: typeof incluirFornecedor }>;

/** Custo e margem só para quem pode ver (o atendente vende pelo preço de venda). */
export function paraPecaDTO(p: PecaComFornecedor, ator: UsuarioSessao): PecaDTO {
  const veCusto = ator.permissoes.verCusto;
  const estoqueAtual = num(p.estoqueAtual);
  const estoqueMinimo = num(p.estoqueMinimo);
  return {
    id: p.id,
    versao: p.versao,
    nome: p.nome,
    sku: p.sku,
    codigoBarras: p.codigoBarras,
    tipo: p.tipo,
    fornecedor: p.fornecedor,
    precoVenda: num(p.precoVenda),
    precoCusto: veCusto ? num(p.precoCusto) : null,
    margemPct: veCusto ? numOuNull(p.margemPct) : null,
    estoqueAtual,
    estoqueMinimo,
    unidade: p.unidade,
    localizacao: p.localizacao,
    ativo: p.ativo,
    // RN-02: chegou no mínimo (ou abaixo) — hora de comprar.
    estoqueBaixo: estoqueAtual <= estoqueMinimo,
  };
}

export async function listar(q: z.output<typeof listarPecasQuery>, ator: UsuarioSessao): Promise<Pagina<PecaDTO>> {
  const where: Prisma.PecaWhereInput = {
    ativo: true,
    ...(q.fornecedorId ? { fornecedorId: q.fornecedorId } : {}),
    ...(q.busca
      ? {
          OR: [
            { nome: { contains: q.busca, mode: 'insensitive' } },
            { sku: { contains: q.busca, mode: 'insensitive' } },
            { codigoBarras: { contains: q.busca } },
            { localizacao: { contains: q.busca, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  // "Estoque baixo" compara duas colunas — o Prisma não filtra isso direto,
  // então vem por SQL e entra como lista de ids.
  if (q.baixo) {
    const baixas = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM pecas WHERE ativo = true AND estoque_atual <= estoque_minimo`;
    where.id = { in: baixas.map((b) => b.id) };
  }

  const [itens, total] = await prisma.$transaction([
    prisma.peca.findMany({ where, orderBy: { nome: 'asc' }, include: incluirFornecedor, ...paginar(q) }),
    prisma.peca.count({ where }),
  ]);
  return pagina(
    itens.map((p) => paraPecaDTO(p, ator)),
    total,
    q,
  );
}

/** O "bip" do leitor: acha a peça pelo código de barras. */
export async function buscarPorCodigo(codigo: string, ator: UsuarioSessao) {
  const p = await prisma.peca.findFirst({ where: { codigoBarras: codigo.trim(), ativo: true }, include: incluirFornecedor });
  if (!p) throw naoEncontrado('Nenhuma peça com esse código de barras');
  return paraPecaDTO(p, ator);
}

export async function buscar(id: string, ator: UsuarioSessao) {
  const p = await prisma.peca.findUnique({ where: { id }, include: incluirFornecedor });
  if (!p) throw naoEncontrado('Peça não encontrada');
  return paraPecaDTO(p, ator);
}

export async function criar(dados: z.output<typeof criarPecaSchema>, ator: UsuarioSessao) {
  const { estoqueInicial, ...campos } = dados;
  const id = await prisma.$transaction(async (tx) => {
    const p = await tx.peca.create({
      data: { ...campos, estoqueAtual: 0, margemPct: calcularMargem(campos.precoCusto, campos.precoVenda) },
    });
    // O estoque inicial também é um movimento: o kardex começa do zero e fecha.
    if (estoqueInicial > 0) {
      await darEntrada(tx, p.id, estoqueInicial, campos.precoCusto, { motivo: 'Cadastro inicial', usuarioId: ator.id });
    }
    return p.id;
  });
  return buscar(id, ator);
}

/** Edita o cadastro. A quantidade em estoque NÃO muda por aqui — só por movimento. */
export async function atualizar(id: string, { versao, ...dados }: z.output<typeof pecaSchema>, ator: UsuarioSessao) {
  const r = await prisma.peca.updateMany({
    where: { id, ...naVersao(versao) },
    data: { ...dados, margemPct: calcularMargem(dados.precoCusto, dados.precoVenda), ...proximaVersao },
  });
  if (r.count === 0) await falhaDeVersao('pecas', id, (await prisma.peca.count({ where: { id } })) > 0, 'Peça não encontrada');
  return buscar(id, ator);
}

export async function inativar(id: string) {
  await prisma.peca.update({ where: { id }, data: { ativo: false } });
}

/** Entrada de mercadoria (RN-04). Informar custo exige ver custo: ele muda o custo médio. */
export async function entrada(id: string, dados: z.output<typeof entradaEstoqueSchema>, ator: UsuarioSessao) {
  if (dados.custoUnit != null && !ator.permissoes.alterarPrecoCusto) {
    throw semPermissao('Seu perfil pode dar entrada, mas não informar o custo da peça.');
  }
  await prisma.$transaction((tx) =>
    darEntrada(tx, id, dados.quantidade, dados.custoUnit ?? null, {
      motivo: dados.motivo ?? 'Entrada de mercadoria',
      usuarioId: ator.id,
    }),
  );
  return buscar(id, ator);
}

/** Inventário: acerta o saldo com o que foi contado na prateleira. */
export async function ajuste(id: string, dados: z.output<typeof ajusteEstoqueSchema>, ator: UsuarioSessao) {
  const r = await prisma.$transaction((tx) =>
    ajustar(tx, id, dados.estoqueContado, { motivo: dados.motivo, usuarioId: ator.id }),
  );
  return { diferenca: r.diferenca, peca: await buscar(id, ator) };
}

/** Kardex da peça: cada entrada e saída, com o saldo depois dela. */
export async function movimentos(
  id: string,
  q: z.output<typeof movimentosQuery>,
  ator: UsuarioSessao,
): Promise<Pagina<MovimentoEstoqueDTO>> {
  const where = { pecaId: id };
  const [itens, total] = await prisma.$transaction([
    prisma.movimentoEstoque.findMany({
      where,
      orderBy: [{ data: 'desc' }, { id: 'desc' }],
      include: {
        usuario: { select: { nome: true } },
        os: { select: { id: true, numero: true } },
        compra: { select: { id: true, numero: true } },
        venda: { select: { id: true, numero: true } },
      },
      ...paginar(q),
    }),
    prisma.movimentoEstoque.count({ where }),
  ]);

  return pagina(
    itens.map((m) => ({
      id: m.id,
      data: m.data.toISOString(),
      tipo: m.tipo,
      quantidade: num(m.quantidade),
      saldoApos: numOuNull(m.saldoApos),
      custoUnit: ator.permissoes.verCusto ? numOuNull(m.custoUnit) : null,
      motivo: m.motivo,
      usuario: m.usuario?.nome ?? null,
      os: m.os,
      compra: m.compra,
      venda: m.venda,
    })),
    total,
    q,
  );
}
