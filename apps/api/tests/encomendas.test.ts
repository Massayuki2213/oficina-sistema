import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { LightMyRequestResponse } from 'fastify';
import { buildApp, type App } from '../src/app.js';
import { db, limparDominio, configPadrao, cenarioBase, atores, estoqueDe, SENHA_PADRAO, type Base } from './ajuda.js';
import * as orcamentos from '../src/modules/orcamentos/orcamentos.service.js';
import * as ordens from '../src/modules/ordens/ordens.service.js';
import * as compras from '../src/modules/compras/compras.service.js';
import * as pecas from '../src/modules/pecas/pecas.service.js';

// ============================================================
// ENCOMENDA DE PEÇAS — o jeito de trabalhar de quem tem pouco estoque.
//
// O cliente aprova o orçamento com o preço estimado da peça; o Dono manda
// a lista para uma autopeça (o que ela não tiver vai para outra); a compra
// que chega atende a encomenda e traz o custo da nota; antes de receber,
// o Dono acerta o preço da peça pela nota.
// ============================================================

let a: Awaited<ReturnType<typeof atores>>;

/** Orçamento com 1 peça, aprovado com a encomenda confirmada. Devolve a OS. */
async function osAprovada(base: Base, quantidade: number, precoUnit?: number) {
  const orc = await orcamentos.criar(
    {
      clienteId: base.cliente.id,
      carroId: base.carro.id,
      desconto: 0,
      servicos: [{ servicoId: base.servico.id, quantidade: 1 }],
      pecas: [{ pecaId: base.peca.id, quantidade, precoUnit }],
    },
    a.atendente,
  );
  const r = await orcamentos.aprovar(orc.id, { confirmarSemEstoque: true }, a.atendente);
  return ordens.buscar(r.os.id, a.dono);
}

const fornecedor = (nome: string) => db.fornecedor.create({ data: { nome, telefone: '11988887777' } });

const comprar = (fornecedorId: string, pecaId: string, quantidade: number, custoUnit: number) =>
  compras.criar({ fornecedorId, pago: false, itens: [{ pecaId, quantidade, custoUnit }] }, a.dono);

async function concluir(osId: string) {
  await ordens.mudarStatus(osId, 'EM_EXECUCAO', a.atendente);
  await ordens.mudarStatus(osId, 'CONCLUIDA', a.atendente);
}

beforeAll(async () => {
  a = await atores();
});
beforeEach(async () => {
  await limparDominio();
  await configPadrao();
});

describe('a encomenda nasce quando falta peça', () => {
  it('a OS guarda quanto faltou e marca o preço como estimado', async () => {
    const base = await cenarioBase({ estoque: 1 });
    const os = await osAprovada(base, 3);
    const [linha] = os.pecas;
    expect(linha.encomenda).toBe(2);
    expect(linha.aPedir).toBe(true);
    expect(linha.precoConferido).toBe(false);
    expect(os.status).toBe('AGUARDANDO_PECA');
    expect(await estoqueDe(base.peca.id)).toBe(-2);
  });

  it('peça que saiu toda da prateleira não é encomenda e o preço já vale', async () => {
    const base = await cenarioBase({ estoque: 10 });
    const [linha] = (await osAprovada(base, 2)).pecas;
    expect(linha.encomenda).toBe(0);
    expect(linha.aPedir).toBe(false);
    expect(linha.precoConferido).toBe(true);
  });

  it('com o saldo já negativo por outra OS, a linha encomenda tudo o que usa', async () => {
    const base = await cenarioBase({ estoque: 0 });
    await osAprovada(base, 1);
    const [linha] = (await osAprovada(base, 2)).pecas;
    expect(linha.encomenda).toBe(2);
  });

  it('aumentar a quantidade sem estoque encomenda a diferença; diminuir, devolve', async () => {
    const base = await cenarioBase({ estoque: 0 });
    const os = await osAprovada(base, 1);
    const itemId = os.pecas[0].id;

    let r = await ordens.alterarPeca(os.id, itemId, { quantidade: 3, confirmarSemEstoque: true }, a.atendente);
    expect(r.pecas[0].encomenda).toBe(3);

    r = await ordens.alterarPeca(os.id, itemId, { quantidade: 2, confirmarSemEstoque: false }, a.atendente);
    expect(r.pecas[0].encomenda).toBe(2);
    expect(await estoqueDe(base.peca.id)).toBe(-2);
  });
});

describe('pedir as peças à autopeça', () => {
  it('anota para quem a lista foi e quando', async () => {
    const base = await cenarioBase({ estoque: 0 });
    const os = await osAprovada(base, 2);
    const autoSul = await fornecedor('Auto Sul');

    const r = await ordens.pedirPecas(os.id, { fornecedorId: autoSul.id, itens: [os.pecas[0].id] }, a.dono);
    expect(r.pecas[0].pedido?.fornecedor.nome).toBe('Auto Sul');
    expect(r.pecas[0].aPedir).toBe(true);
  });

  it('o que a primeira não tem vai para outra: a linha passa a ser da segunda', async () => {
    const base = await cenarioBase({ estoque: 0 });
    const os = await osAprovada(base, 1);
    const [autoSul, pecasJa] = [await fornecedor('Auto Sul'), await fornecedor('Peças Já')];

    await ordens.pedirPecas(os.id, { fornecedorId: autoSul.id, itens: [os.pecas[0].id] }, a.dono);
    const r = await ordens.pedirPecas(os.id, { fornecedorId: pecasJa.id, itens: [os.pecas[0].id] }, a.dono);
    expect(r.pecas[0].pedido?.fornecedor.nome).toBe('Peças Já');
  });

  it('peça que já chegou (ou não é encomenda) não entra na lista', async () => {
    const base = await cenarioBase({ estoque: 10 });
    const os = await osAprovada(base, 1);
    const autoSul = await fornecedor('Auto Sul');
    await expect(ordens.pedirPecas(os.id, { fornecedorId: autoSul.id, itens: [os.pecas[0].id] }, a.dono)).rejects.toThrow(
      /já chegou ou saiu da OS/,
    );
  });
});

describe('a compra atende a encomenda', () => {
  it('a linha sai da lista, aponta a compra e fica com o custo da nota', async () => {
    const base = await cenarioBase({ estoque: 0, custoPeca: 20 });
    const os = await osAprovada(base, 2);
    const autoSul = await fornecedor('Auto Sul');

    const compra = await comprar(autoSul.id, base.peca.id, 2, 31);
    expect(compra.itens[0].encomendas).toEqual([{ os: { id: os.id, numero: os.numero }, quantidade: 2 }]);

    const depois = await ordens.buscar(os.id, a.dono);
    expect(depois.pecas[0].aPedir).toBe(false);
    expect(depois.pecas[0].chegou).toMatchObject({ compra: { numero: compra.numero }, fornecedor: 'Auto Sul' });
    expect(await estoqueDe(base.peca.id)).toBe(0);
    const linha = await db.oSPeca.findFirstOrThrow({ where: { osId: os.id } });
    expect(Number(linha.custoUnit)).toBe(31);
  });

  it('parte da prateleira e parte encomendada: o custo da linha é a média das duas', async () => {
    const base = await cenarioBase({ estoque: 2, custoPeca: 20 });
    const os = await osAprovada(base, 4);
    await comprar((await fornecedor('Auto Sul')).id, base.peca.id, 2, 30);
    const linha = await db.oSPeca.findFirstOrThrow({ where: { osId: os.id } });
    expect(Number(linha.custoUnit)).toBe(25);
  });

  it('atende primeiro a encomenda pedida a este distribuidor, mesmo sendo mais nova', async () => {
    const base = await cenarioBase({ estoque: 0 });
    const antiga = await osAprovada(base, 1);
    const nova = await osAprovada(base, 1);
    const pecasJa = await fornecedor('Peças Já');
    await ordens.pedirPecas(nova.id, { fornecedorId: pecasJa.id, itens: [nova.pecas[0].id] }, a.dono);

    await comprar(pecasJa.id, base.peca.id, 1, 30);
    expect((await ordens.buscar(nova.id, a.dono)).pecas[0].aPedir).toBe(false);
    expect((await ordens.buscar(antiga.id, a.dono)).pecas[0].aPedir).toBe(true);
  });

  it('chegou menos do que a linha encomendou: ela continua na lista', async () => {
    const base = await cenarioBase({ estoque: 0 });
    const os = await osAprovada(base, 3);
    await comprar((await fornecedor('Auto Sul')).id, base.peca.id, 2, 30);
    expect((await ordens.buscar(os.id, a.dono)).pecas[0].aPedir).toBe(true);
    expect(await estoqueDe(base.peca.id)).toBe(-1);
  });

  it('apagar a compra devolve a encomenda para a lista', async () => {
    const base = await cenarioBase({ estoque: 0 });
    const os = await osAprovada(base, 1);
    const compra = await comprar((await fornecedor('Auto Sul')).id, base.peca.id, 1, 30);
    await compras.excluir(compra.id, a.dono);
    const r = await ordens.buscar(os.id, a.dono);
    expect(r.pecas[0].aPedir).toBe(true);
    expect(r.pecas[0].chegou).toBeNull();
  });

  it('a lista de encomendas pendentes deixa de fora as que chegaram e as de OS cancelada', async () => {
    const base = await cenarioBase({ estoque: 0 });
    const chega = await osAprovada(base, 1);
    const cancelada = await osAprovada(base, 1);
    const pendente = await osAprovada(base, 1);
    const autoSul = await fornecedor('Auto Sul');
    await ordens.pedirPecas(chega.id, { fornecedorId: autoSul.id, itens: [chega.pecas[0].id] }, a.dono);
    await comprar(autoSul.id, base.peca.id, 1, 30);
    await ordens.cancelar(cancelada.id, 'Cliente desistiu', a.atendente);

    const lista = await compras.encomendasPendentes(a.dono);
    expect(lista.map((e) => e.os.numero)).toEqual([pendente.numero]);
    expect(lista[0]).toMatchObject({ quantidade: 1, os: { placa: base.carro.placa }, peca: { nome: 'Filtro de óleo' } });
  });
});

describe('o Dono confere o preço antes de receber', () => {
  it('receber com preço estimado pede confirmação; confirmando, recebe', async () => {
    const base = await cenarioBase({ estoque: 0, precoServico: 100, precoPeca: 50 });
    const os = await osAprovada(base, 1);
    await concluir(os.id);

    await expect(
      ordens.receber(os.id, { pagamentos: [{ forma: 'PIX', valor: 150 }], liberarFiado: false }, a.atendente),
    ).rejects.toMatchObject({ codigo: 'PRECO_A_CONFERIR', detalhes: [{ nome: 'Filtro de óleo', precoUnit: 50 }] });

    const r = await ordens.receber(
      os.id,
      { pagamentos: [{ forma: 'PIX', valor: 150 }], liberarFiado: false, receberSemConferir: true },
      a.atendente,
    );
    expect(r.formaPagamento).toBe('PIX');
  });

  it('o Dono acerta o preço pela nota: a linha fica conferida e o total muda', async () => {
    const base = await cenarioBase({ estoque: 0, precoServico: 100, precoPeca: 50 });
    const os = await osAprovada(base, 1);
    const r = await ordens.alterarPeca(os.id, os.pecas[0].id, { precoUnit: 62, confirmarSemEstoque: false }, a.dono);
    expect(r.pecas[0].precoConferido).toBe(true);
    expect(r.total).toBe(162);

    await concluir(os.id);
    const paga = await ordens.receber(os.id, { pagamentos: [{ forma: 'PIX', valor: 162 }], liberarFiado: false }, a.atendente);
    expect(paga.formaPagamento).toBe('PIX');
  });

  it('o Dono pode conferir que o estimado vale, sem mudar o preço', async () => {
    const base = await cenarioBase({ estoque: 0, precoPeca: 50 });
    const os = await osAprovada(base, 1);
    const r = await ordens.alterarPeca(os.id, os.pecas[0].id, { conferirPreco: true, confirmarSemEstoque: false }, a.dono);
    expect(r.pecas[0].precoConferido).toBe(true);
    expect(r.pecas[0].precoUnit).toBe(50);
  });

  it('o atendente muda o preço, mas não confere pela nota', async () => {
    const base = await cenarioBase({ estoque: 0, precoPeca: 50 });
    const os = await osAprovada(base, 1);
    const r = await ordens.alterarPeca(os.id, os.pecas[0].id, { precoUnit: 55, confirmarSemEstoque: false }, a.atendente);
    expect(r.pecas[0].precoConferido).toBe(false);
    await expect(
      ordens.alterarPeca(os.id, os.pecas[0].id, { conferirPreco: true, confirmarSemEstoque: false }, a.atendente),
    ).rejects.toThrow(/Dono/);
  });

  it('pedir mais da peça sem estoque volta a deixar o preço a conferir', async () => {
    const base = await cenarioBase({ estoque: 0 });
    const os = await osAprovada(base, 1);
    await ordens.alterarPeca(os.id, os.pecas[0].id, { conferirPreco: true, confirmarSemEstoque: false }, a.dono);
    const r = await ordens.alterarPeca(os.id, os.pecas[0].id, { quantidade: 2, confirmarSemEstoque: true }, a.dono);
    expect(r.pecas[0].precoConferido).toBe(false);
  });
});

describe('peça a definir: o balcão cadastra só o nome', () => {
  it('nasce sem custo e sem preço, marcada a definir; o mesmo nome devolve a mesma peça', async () => {
    const p = await pecas.criarRapida({ nome: 'Bomba de combustível Gol', unidade: 'un' }, a.atendente);
    expect(p).toMatchObject({ precoVenda: 0, precoADefinir: true, estoqueAtual: 0 });
    const outra = await pecas.criarRapida({ nome: 'bomba de combustível gol', unidade: 'un' }, a.atendente);
    expect(outra.id).toBe(p.id);
  });

  it('entra no orçamento com o preço estimado, e a linha diz que é estimado', async () => {
    const base = await cenarioBase({ precoServico: 100 });
    const p = await pecas.criarRapida({ nome: 'Bomba de combustível', unidade: 'un' }, a.atendente);
    const orc = await orcamentos.criar(
      { clienteId: base.cliente.id, carroId: base.carro.id, desconto: 0, servicos: [], pecas: [{ pecaId: p.id, quantidade: 1, precoUnit: 380 }] },
      a.atendente,
    );
    expect(orc.total).toBe(380);
    expect(orc.pecas[0].precoADefinir).toBe(true);
  });

  it('o preço estimado não encobre desconto dado nos outros itens (RN-08)', async () => {
    const base = await cenarioBase({ precoServico: 1000 });
    const p = await pecas.criarRapida({ nome: 'Bomba de combustível', unidade: 'un' }, a.atendente);
    // Mão de obra 20% abaixo da tabela; teto sem senha = 10%.
    await expect(
      orcamentos.criar(
        {
          clienteId: base.cliente.id,
          carroId: base.carro.id,
          desconto: 0,
          servicos: [{ servicoId: base.servico.id, quantidade: 1, precoUnit: 800 }],
          pecas: [{ pecaId: p.id, quantidade: 1, precoUnit: 500 }],
        },
        a.atendente,
      ),
    ).rejects.toMatchObject({ codigo: 'SENHA_DONO_NECESSARIA' });
  });

  it('o primeiro preço que o Dono acerta na OS vira o preço de tabela da peça', async () => {
    const base = await cenarioBase();
    const p = await pecas.criarRapida({ nome: 'Bomba de combustível', unidade: 'un' }, a.atendente);
    const orc = await orcamentos.criar(
      { clienteId: base.cliente.id, carroId: base.carro.id, desconto: 0, servicos: [], pecas: [{ pecaId: p.id, quantidade: 1, precoUnit: 380 }] },
      a.atendente,
    );
    const { os } = await orcamentos.aprovar(orc.id, { confirmarSemEstoque: true }, a.atendente);
    const completa = await ordens.buscar(os.id, a.dono);
    expect(completa.pecas[0].precoConferido).toBe(false);

    await ordens.alterarPeca(os.id, completa.pecas[0].id, { precoUnit: 410, confirmarSemEstoque: false }, a.dono);
    const depois = await pecas.buscar(p.id, a.dono);
    expect(depois).toMatchObject({ precoVenda: 410, precoADefinir: false });
  });
});

// ---- Pelas rotas: quem pode o quê ------------------------------------------

describe('rotas', () => {
  let app: App;
  const cookieDe = (r: LightMyRequestResponse) => {
    const c = r.cookies.find((x) => x.name === 'hermes_sessao');
    return c ? `hermes_sessao=${c.value}` : '';
  };
  async function entrar(email: string) {
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, senha: SENHA_PADRAO } });
    expect(r.statusCode, r.body).toBe(200);
    return cookieDe(r);
  }

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('pedir peças é do Dono: o atendente recebe 403', async () => {
    const base = await cenarioBase({ estoque: 0 });
    const os = await osAprovada(base, 1);
    const autoSul = await fornecedor('Auto Sul');
    const payload = { fornecedorId: autoSul.id, itens: [os.pecas[0].id] };

    const atendente = await entrar(a.atendente.email);
    const negado = await app.inject({ method: 'POST', url: `/api/ordens/${os.id}/pedir-pecas`, headers: { cookie: atendente }, payload });
    expect(negado.statusCode).toBe(403);

    const dono = await entrar(a.dono.email);
    const ok = await app.inject({ method: 'POST', url: `/api/ordens/${os.id}/pedir-pecas`, headers: { cookie: dono }, payload });
    expect(ok.statusCode, ok.body).toBe(200);
  });

  it('peça rápida é do balcão: o mecânico recebe 403', async () => {
    const payload = { nome: 'Bomba de combustível' };
    const mecanico = await entrar(a.mecanico.email);
    const negado = await app.inject({ method: 'POST', url: '/api/pecas/rapida', headers: { cookie: mecanico }, payload });
    expect(negado.statusCode).toBe(403);

    const atendente = await entrar(a.atendente.email);
    const ok = await app.inject({ method: 'POST', url: '/api/pecas/rapida', headers: { cookie: atendente }, payload });
    expect(ok.statusCode, ok.body).toBe(201);
    expect(ok.json()).toMatchObject({ precoADefinir: true, precoCusto: null });
  });
});

afterAll(async () => {
  await db.$disconnect();
});
