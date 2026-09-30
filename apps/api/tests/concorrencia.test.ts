import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { LightMyRequestResponse } from 'fastify';
import { buildApp, type App } from '../src/app.js';
import { db, limparDominio, configPadrao, atores, cenarioBase, SENHA_PADRAO } from './ajuda.js';

// ============================================================
// Concorrência otimista (ADR 0010): duas pessoas abrem o mesmo
// cadastro; a segunda a salvar não apaga o trabalho da primeira
// sem saber — recebe 409 dizendo quem salvou e quando.
// ============================================================

let app: App;
let a: Awaited<ReturnType<typeof atores>>;
const sessoes: Record<string, string> = {};

const cookieDe = (r: LightMyRequestResponse) => `hermes_sessao=${r.cookies.find((x) => x.name === 'hermes_sessao')!.value}`;
async function entrar(email: string) {
  return cookieDe(await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, senha: SENHA_PADRAO } }));
}
const enviar = (quem: string, method: 'PUT' | 'PATCH' | 'GET', url: string, payload?: object) =>
  app.inject({ method, url, headers: { cookie: sessoes[quem] }, payload });

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
beforeEach(async () => {
  await limparDominio();
  await configPadrao();
  a = await atores();
  sessoes.dono = await entrar(a.dono.email);
  sessoes.atendente = await entrar(a.atendente.email);
  sessoes.mecanico = await entrar(a.mecanico.email);
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

describe('cadastro aberto por duas pessoas', () => {
  it('a segunda a salvar recebe 409 com o nome de quem salvou antes — e nada dela é gravado', async () => {
    const cli = await db.cliente.create({ data: { nome: 'Dona Maria' } });
    const carregado = (await enviar('dono', 'GET', `/api/clientes/${cli.id}`)).json();
    expect(carregado.versao).toBe(0);

    // As duas abriram na versão 0. A atendente salva primeiro.
    const primeira = await enviar('atendente', 'PUT', `/api/clientes/${cli.id}`, { nome: 'Dona Maria', observacoes: 'Prefere WhatsApp', versao: 0 });
    expect(primeira.statusCode).toBe(200);
    expect(primeira.json().versao).toBe(1);

    const segunda = await enviar('dono', 'PUT', `/api/clientes/${cli.id}`, { nome: 'Maria da Silva', versao: 0 });
    expect(segunda.statusCode).toBe(409);
    expect(segunda.json()).toMatchObject({
      codigo: 'CONFLITO_EDICAO',
      message: expect.stringMatching(/^Atendente Teste salvou uma alteração aqui às \d{2}:\d{2}/),
      detalhes: { por: 'Atendente Teste', em: expect.any(String) },
    });

    const noBanco = await db.cliente.findUniqueOrThrow({ where: { id: cli.id } });
    expect(noBanco).toMatchObject({ nome: 'Dona Maria', observacoes: 'Prefere WhatsApp', versao: 1 });
  });

  it('com a versão certa, grava e sobe a versão', async () => {
    const peca = await db.peca.create({ data: { nome: 'Correia', precoCusto: 30, precoVenda: 60 } });
    const r1 = await enviar('dono', 'PUT', `/api/pecas/${peca.id}`, { nome: 'Correia', precoCusto: 30, precoVenda: 65, versao: 0 });
    const r2 = await enviar('dono', 'PUT', `/api/pecas/${peca.id}`, { nome: 'Correia', precoCusto: 30, precoVenda: 70, versao: 1 });
    expect([r1.statusCode, r2.statusCode]).toEqual([200, 200]);
    expect(r2.json()).toMatchObject({ precoVenda: 70, versao: 2 });
  });

  it('sem versão (integração antiga) grava direto, como antes', async () => {
    const serv = await db.servico.create({ data: { nome: 'Alinhamento', precoMaoDeObra: 80, versao: 5 } });
    const r = await enviar('dono', 'PUT', `/api/servicos/${serv.id}`, { nome: 'Alinhamento', precoMaoDeObra: 90 });
    expect(r.statusCode).toBe(200);
    expect(r.json().versao).toBe(6);
  });

  it('registro que não existe continua 404 (não 409)', async () => {
    const r = await enviar('dono', 'PUT', '/api/servicos/nao-existe', { nome: 'Balanceamento', precoMaoDeObra: 1, versao: 0 });
    expect(r.statusCode).toBe(404);
  });

  it('a versão enviada pela tela nunca é gravada como veio (quem manda é o servidor)', async () => {
    const f = await db.fornecedor.create({ data: { nome: 'Auto Peças Sul' } });
    const r = await enviar('dono', 'PUT', `/api/fornecedores/${f.id}`, { nome: 'Auto Peças Sul Ltda', versao: 0 });
    expect(r.json().versao).toBe(1);
  });
});

describe('ordem de serviço', () => {
  async function osDoMecanico() {
    const base = await cenarioBase();
    return db.ordemServico.create({ data: { clienteId: base.cliente.id, carroId: base.carro.id, mecanicoId: a.mecanico.id, status: 'EM_EXECUCAO' } });
  }

  it('mecânico escreve o laudo mandando a versão (e ela conta)', async () => {
    const os = await osDoMecanico();
    const r = await enviar('mecanico', 'PATCH', `/api/ordens/${os.id}`, { observacoes: 'Pastilhas no fim', versao: 0 });
    expect(r.statusCode).toBe(200);
    expect(r.json().versao).toBe(1);
  });

  it('balcão salvando a queixa por cima do laudo que o mecânico acabou de escrever: 409', async () => {
    const os = await osDoMecanico();
    await enviar('mecanico', 'PATCH', `/api/ordens/${os.id}`, { observacoes: 'Disco empenado', versao: 0 });

    const r = await enviar('atendente', 'PATCH', `/api/ordens/${os.id}`, { defeitoRelatado: 'Barulho ao frear', versao: 0 });
    expect(r.statusCode).toBe(409);
    expect(r.json().detalhes.por).toBe('Mecanico Teste');
    expect((await db.ordemServico.findUniqueOrThrow({ where: { id: os.id } })).observacoes).toBe('Disco empenado');
  });

  it('mudar o status ou mexer nos itens NÃO conta como edição do formulário (sem conflito falso)', async () => {
    const base = await cenarioBase();
    const os = await db.ordemServico.create({ data: { clienteId: base.cliente.id, carroId: base.carro.id } });
    await enviar('atendente', 'PATCH', `/api/ordens/${os.id}/status`, { status: 'EM_EXECUCAO' });
    await app.inject({
      method: 'POST',
      url: `/api/ordens/${os.id}/servicos`,
      headers: { cookie: sessoes.atendente },
      payload: { servicoId: base.servico.id, quantidade: 1 },
    });

    const r = await enviar('atendente', 'PATCH', `/api/ordens/${os.id}`, { observacoes: 'Revisado', versao: 0 });
    expect(r.statusCode).toBe(200);
  });
});

describe('idempotência dos POST (ADR 0011)', () => {
  const vender = (quem: string, pecaId: string, chave?: string, extra: object = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/vendas',
      headers: { cookie: sessoes[quem], ...(chave ? { 'idempotency-key': chave } : {}) },
      payload: { itens: [{ pecaId, quantidade: 2 }], formaPagamento: 'PIX', ...extra },
    });
  const CHAVE = 'venda-balcao-0001-abcdef';

  it('a resposta se perdeu e a tela repetiu: a venda sai UMA vez, e a repetição recebe a mesma resposta', async () => {
    const { peca } = await cenarioBase({ estoque: 10, precoPeca: 50 });
    const primeira = await vender('atendente', peca.id, CHAVE);
    const repetida = await vender('atendente', peca.id, CHAVE);

    expect(primeira.statusCode).toBe(201);
    expect(repetida.statusCode).toBe(201);
    expect(repetida.headers['idempotent-replayed']).toBe('true');
    expect(repetida.json()).toEqual(primeira.json());

    expect(await db.venda.count()).toBe(1);
    expect(Number((await db.peca.findUniqueOrThrow({ where: { id: peca.id } })).estoqueAtual)).toBe(8);
    expect(await db.lancamentoCaixa.count()).toBe(1);
    expect(await db.logAuditoria.count({ where: { entidade: 'vendas' } })).toBe(1);
  });

  it('sem chave, cada POST é uma operação (como antes)', async () => {
    const { peca } = await cenarioBase({ estoque: 10 });
    await vender('atendente', peca.id);
    await vender('atendente', peca.id);
    expect(await db.venda.count()).toBe(2);
  });

  it('mesma chave com outro conteúdo: recusada (não é repetição, é engano)', async () => {
    const { peca } = await cenarioBase({ estoque: 10 });
    await vender('atendente', peca.id, CHAVE);
    const r = await vender('atendente', peca.id, CHAVE, { formaPagamento: 'CARTAO' });
    expect(r.statusCode).toBe(422);
    expect(r.json().codigo).toBe('CHAVE_REUTILIZADA');
    expect(await db.venda.count()).toBe(1);
  });

  it('recusa não prende a chave: pediu a senha do Dono, reenvia com ela e passa', async () => {
    const { peca } = await cenarioBase({ estoque: 10, precoPeca: 50 });
    const semSenha = await vender('atendente', peca.id, CHAVE, { desconto: 50 });
    expect(semSenha.json().codigo).toBe('SENHA_DONO_NECESSARIA');
    const comSenha = await vender('atendente', peca.id, CHAVE, { desconto: 50, senhaDono: SENHA_PADRAO });
    expect(comSenha.statusCode).toBe(201);
    expect(await db.venda.count()).toBe(1);
  });

  it('a primeira ainda está processando: a repetição espera (409), não duplica', async () => {
    const { peca } = await cenarioBase({ estoque: 10 });
    await db.chaveIdempotencia.create({ data: { chave: CHAVE, usuarioId: a.atendente.id, rota: 'POST /api/vendas', hashCorpo: 'x' } });
    const r = await vender('atendente', peca.id, CHAVE);
    expect(r.statusCode).toBe(409);
    expect(r.json().codigo).toBe('OPERACAO_EM_ANDAMENTO');
    expect(await db.venda.count()).toBe(0);
  });

  it('reserva órfã (o servidor caiu no meio): depois de 1 minuto, quem repete assume', async () => {
    const { peca } = await cenarioBase({ estoque: 10 });
    await db.chaveIdempotencia.create({
      data: { chave: CHAVE, usuarioId: a.atendente.id, rota: 'POST /api/vendas', hashCorpo: 'x', criadaEm: new Date(Date.now() - 2 * 60_000) },
    });
    expect((await vender('atendente', peca.id, CHAVE)).statusCode).toBe(201);
    expect(await db.venda.count()).toBe(1);
  });

  it('a chave é por pessoa: a mesma chave de outro usuário é outra operação', async () => {
    const { peca } = await cenarioBase({ estoque: 10 });
    await vender('atendente', peca.id, CHAVE);
    await vender('dono', peca.id, CHAVE);
    expect(await db.venda.count()).toBe(2);
  });

  it('chave em formato estranho: 400', async () => {
    const { peca } = await cenarioBase({ estoque: 10 });
    expect((await vender('atendente', peca.id, 'curta')).statusCode).toBe(400);
  });
});

describe('orçamento e configuração', () => {
  it('orçamento com versão velha: 409 e os itens continuam os de antes', async () => {
    const base = await cenarioBase({ precoServico: 100 });
    const criado = (
      await app.inject({
        method: 'POST',
        url: '/api/orcamentos',
        headers: { cookie: sessoes.atendente },
        payload: { clienteId: base.cliente.id, carroId: base.carro.id, servicos: [{ servicoId: base.servico.id, quantidade: 1 }] },
      })
    ).json();
    const editar = (quem: string, quantidade: number) =>
      enviar(quem, 'PUT', `/api/orcamentos/${criado.id}`, {
        clienteId: base.cliente.id,
        carroId: base.carro.id,
        servicos: [{ servicoId: base.servico.id, quantidade }],
        versao: 0,
      });

    expect((await editar('atendente', 2)).statusCode).toBe(200);
    expect((await editar('dono', 5)).statusCode).toBe(409);
    const itens = await db.orcamentoServico.findMany({ where: { orcamentoId: criado.id } });
    expect(itens.map((i) => i.quantidade)).toEqual([2]);
  });

  it('dois Donos mexendo nas regras da oficina ao mesmo tempo', async () => {
    const versao = (await enviar('dono', 'GET', '/api/oficina')).json().versao;
    const regras = (desconto: number) => ({ nome: 'Oficina de Teste', margemPadrao: 80, descontoMaxSemSenha: desconto, garantiaDias: 15, validadeOrcamentoDias: 15, versao });

    expect((await enviar('dono', 'PUT', '/api/oficina', regras(15))).statusCode).toBe(200);
    const r = await enviar('dono', 'PUT', '/api/oficina', regras(40));
    expect(r.statusCode).toBe(409);
    expect(Number((await db.oficina.findUniqueOrThrow({ where: { id: 'unica' } })).descontoMaxSemSenha)).toBe(15);
  });
});
