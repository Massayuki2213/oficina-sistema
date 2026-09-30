import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { db, limparDominio, configPadrao, cenarioBase, atores, estoqueDe } from './ajuda.js';
import * as pecas from '../src/modules/pecas/pecas.service.js';
import * as compras from '../src/modules/compras/compras.service.js';
import * as vendas from '../src/modules/vendas/vendas.service.js';
import * as relatorios from '../src/modules/relatorios/relatorios.service.js';
import { prisma } from '../src/lib/prisma.js';
import { darEntrada, darSaida } from '../src/dominio/estoque.js';

// Estoque: custo médio (RN-04), inventário, compra do distribuidor e
// venda de balcão. Toda mudança de quantidade deixa rastro no kardex.

let a: Awaited<ReturnType<typeof atores>>;

beforeAll(async () => {
  a = await atores();
});
beforeEach(async () => {
  await limparDominio();
  await configPadrao();
});
afterAll(async () => {
  await db.$disconnect();
});

const custoDe = async (id: string) => Number((await db.peca.findUniqueOrThrow({ where: { id } })).precoCusto);

describe('RN-04 — custo médio ponderado', () => {
  it('pondera o estoque que havia com o que chegou', async () => {
    const { peca } = await cenarioBase({ estoque: 10, custoPeca: 20 });
    await prisma.$transaction((tx) => darEntrada(tx, peca.id, 5, 30, { motivo: 'teste' }));
    // (10 x 20 + 5 x 30) / 15 = 23,33
    expect(await custoDe(peca.id)).toBe(23.33);
    expect(await estoqueDe(peca.id)).toBe(15);
  });

  it('com saldo negativo (peça encomendada), o custo passa a ser o da entrada', async () => {
    const { peca } = await cenarioBase({ estoque: 0, custoPeca: 20 });
    await prisma.$transaction((tx) => darSaida(tx, peca.id, 3, { motivo: 'OS encomendada' }));
    await prisma.$transaction((tx) => darEntrada(tx, peca.id, 5, 30, { motivo: 'chegou' }));
    // A conta antiga dava (−3 x 20 + 5 x 30) / 2 = 45 — um custo que não existe.
    expect(await custoDe(peca.id)).toBe(30);
    expect(await estoqueDe(peca.id)).toBe(2);
  });

  it('entrada sem custo (devolução) não mexe no custo', async () => {
    const { peca } = await cenarioBase({ estoque: 4, custoPeca: 20 });
    await prisma.$transaction((tx) => darEntrada(tx, peca.id, 2, null, { motivo: 'devolução' }));
    expect(await custoDe(peca.id)).toBe(20);
  });
});

describe('entrada, inventário e kardex', () => {
  it('o atendente dá entrada, mas não informa custo', async () => {
    const { peca } = await cenarioBase({ estoque: 1 });
    const r = await pecas.entrada(peca.id, { quantidade: 4 }, a.atendente);
    expect(r.estoqueAtual).toBe(5);
    expect(r.precoCusto).toBeNull(); // o atendente não vê custo
    await expect(pecas.entrada(peca.id, { quantidade: 1, custoUnit: 10 }, a.atendente)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('inventário grava a diferença (com sinal) e o saldo passa a ser o contado', async () => {
    const { peca } = await cenarioBase({ estoque: 10 });
    const r = await pecas.ajuste(peca.id, { estoqueContado: 7.5, motivo: 'Contagem de fim de mês' }, a.dono);
    expect(r.diferenca).toBe(-2.5);
    expect(r.peca.estoqueAtual).toBe(7.5);

    const k = await pecas.movimentos(peca.id, { pagina: 1, porPagina: 10 }, a.dono);
    expect(k.itens[0]).toMatchObject({ tipo: 'AJUSTE', quantidade: -2.5, saldoApos: 7.5, motivo: 'Contagem de fim de mês' });
    expect(k.itens[0].usuario).toBe(a.dono.nome);
  });

  it('contagem igual ao sistema não gera movimento', async () => {
    const { peca } = await cenarioBase({ estoque: 10 });
    const r = await pecas.ajuste(peca.id, { estoqueContado: 10, motivo: 'Conferência' }, a.dono);
    expect(r.diferenca).toBe(0);
    expect(await db.movimentoEstoque.count()).toBe(0);
  });

  it('cadastro com estoque inicial já nasce com o movimento no kardex', async () => {
    const p = await pecas.criar(
      { nome: 'Palheta', precoCusto: 15, precoVenda: 35, estoqueInicial: 6, estoqueMinimo: 2, unidade: 'un', tipo: 'PRODUTO' },
      a.dono,
    );
    expect(p.estoqueAtual).toBe(6);
    expect(p.margemPct).toBe(133.33);
    const k = await pecas.movimentos(p.id, { pagina: 1, porPagina: 10 }, a.dono);
    expect(k.total).toBe(1);
    expect(k.itens[0]).toMatchObject({ tipo: 'ENTRADA', quantidade: 6, saldoApos: 6 });
  });

  it('editar o cadastro não mexe no estoque', async () => {
    const { peca } = await cenarioBase({ estoque: 10 });
    await pecas.atualizar(
      peca.id,
      { nome: 'Filtro de óleo (novo nome)', precoCusto: 20, precoVenda: 55, estoqueMinimo: 3, unidade: 'un', tipo: 'PECA' },
      a.dono,
    );
    expect(await estoqueDe(peca.id)).toBe(10);
  });
});

describe('compra do distribuidor (contas a pagar)', () => {
  it('a prazo: entra no estoque, recalcula o custo e fica "a pagar" sem sair do caixa', async () => {
    const { peca } = await cenarioBase({ estoque: 10, custoPeca: 20 });
    const forn = await db.fornecedor.create({ data: { nome: 'Auto Sul' } });

    const c = await compras.criar(
      { fornecedorId: forn.id, pago: false, itens: [{ pecaId: peca.id, quantidade: 10, custoUnit: 26 }] },
      a.dono,
    );
    expect(c.status).toBe('PENDENTE');
    expect(c.valorTotal).toBe(260);
    expect(await estoqueDe(peca.id)).toBe(20);
    expect(await custoDe(peca.id)).toBe(23);
    expect(await db.lancamentoCaixa.count()).toBe(0);

    const devo = await compras.contasAPagar();
    expect(devo.totalAPagar).toBe(260);

    await compras.pagar(c.id, { formaPagamento: 'TRANSFERENCIA' }, a.dono);
    const saida = await db.lancamentoCaixa.findFirstOrThrow({ where: { compraId: c.id } });
    expect(Number(saida.valor)).toBe(260);
    await expect(compras.pagar(c.id, { formaPagamento: 'PIX' }, a.dono)).rejects.toThrow(/já foi paga/);
  });

  it('peça nova cadastrada na hora da compra', async () => {
    const forn = await db.fornecedor.create({ data: { nome: 'Peças Express' } });
    const c = await compras.criar(
      {
        fornecedorId: forn.id,
        pago: true,
        formaPagamento: 'PIX',
        itens: [{ pecaNova: { nome: 'Lâmpada H4', precoVenda: 30, unidade: 'un' }, quantidade: 4, custoUnit: 12 }],
      },
      a.dono,
    );
    const nova = await db.peca.findFirstOrThrow({ where: { nome: 'Lâmpada H4' } });
    expect(Number(nova.estoqueAtual)).toBe(4);
    expect(Number(nova.precoCusto)).toBe(12);
    expect(c.status).toBe('PAGA');
    expect(await db.lancamentoCaixa.count({ where: { compraId: c.id } })).toBe(1);
  });

  it('excluir compra a prazo estorna o estoque; compra paga não se exclui', async () => {
    const { peca } = await cenarioBase({ estoque: 10 });
    const forn = await db.fornecedor.create({ data: { nome: 'Auto Sul' } });
    const c = await compras.criar({ fornecedorId: forn.id, pago: false, itens: [{ pecaId: peca.id, quantidade: 5, custoUnit: 20 }] }, a.dono);
    expect(await estoqueDe(peca.id)).toBe(15);
    await compras.excluir(c.id, a.dono);
    expect(await estoqueDe(peca.id)).toBe(10);

    const paga = await compras.criar({ fornecedorId: forn.id, pago: true, itens: [{ pecaId: peca.id, quantidade: 1, custoUnit: 20 }] }, a.dono);
    await expect(compras.excluir(paga.id, a.dono)).rejects.toThrow(/Compra paga não pode ser apagada/);
  });

  it('acerto quita todas as compras em aberto do distribuidor num lançamento só', async () => {
    const { peca } = await cenarioBase();
    const forn = await db.fornecedor.create({ data: { nome: 'Auto Sul' } });
    for (const qtd of [1, 2]) {
      await compras.criar({ fornecedorId: forn.id, pago: false, itens: [{ pecaId: peca.id, quantidade: qtd, custoUnit: 50 }] }, a.dono);
    }
    const r = await compras.quitarFornecedor(forn.id, { formaPagamento: 'TRANSFERENCIA' }, a.dono);
    expect(r).toEqual({ quitadas: 2, total: 150 });
    expect(await db.lancamentoCaixa.count()).toBe(1);
    expect((await compras.contasAPagar()).totalAPagar).toBe(0);
  });
});

describe('venda de balcão', () => {
  it('baixa o estoque e entra no caixa na hora', async () => {
    const { peca } = await cenarioBase({ estoque: 10, precoPeca: 50 });
    const v = await vendas.criar(
      { itens: [{ pecaId: peca.id, quantidade: 2 }], desconto: 0, formaPagamento: 'PIX', confirmarSemEstoque: false },
      a.atendente,
    );
    expect(v.total).toBe(100);
    expect(await estoqueDe(peca.id)).toBe(8);
    const entrada = await db.lancamentoCaixa.findFirstOrThrow({ where: { vendaId: v.id } });
    expect(entrada.origem).toBe('VENDA_BALCAO');

    const r = await relatorios.resumo({});
    expect(r.vendasBalcao).toBe(100);
    expect(r.faturamento).toBe(100);
    expect(r.custoPecasVendidas).toBe(40);
  });

  it('cancelar devolve a peça e estorna o dinheiro', async () => {
    const { peca } = await cenarioBase({ estoque: 10, precoPeca: 50 });
    const v = await vendas.criar(
      { itens: [{ pecaId: peca.id, quantidade: 2 }], desconto: 0, formaPagamento: 'A_VISTA', confirmarSemEstoque: false },
      a.atendente,
    );
    const c = await vendas.cancelar(v.id, 'Peça errada', a.dono);
    expect(c.cancelada).toBe(true);
    expect(await estoqueDe(peca.id)).toBe(10);
    expect((await relatorios.resumo({})).faturamento).toBe(0);
    await expect(vendas.cancelar(v.id, 'de novo', a.dono)).rejects.toThrow(/já foi cancelada/);
  });
});
