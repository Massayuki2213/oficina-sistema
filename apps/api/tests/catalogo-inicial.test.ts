import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { LightMyRequestResponse } from 'fastify';
import { buildApp, type App } from '../src/app.js';
import { db, limparDominio, configPadrao, cenarioBase, atores, SENHA_PADRAO } from './ajuda.js';
import { PECAS_INICIAIS, SERVICOS_INICIAIS, carregarCatalogoInicial } from '../src/dominio/catalogo-inicial.js';
import * as orcamentos from '../src/modules/orcamentos/orcamentos.service.js';

// ============================================================
// CATÁLOGO INICIAL — a oficina nova não trava no primeiro orçamento
// por falta de serviço e peça cadastrados. Tudo entra sem preço:
// um valor inventado aqui iria parar no orçamento de um cliente.
// ============================================================

let a: Awaited<ReturnType<typeof atores>>;

beforeAll(async () => {
  a = await atores();
});
beforeEach(async () => {
  await limparDominio();
  await configPadrao();
});

describe('carregar o catálogo inicial', () => {
  it('serviços com mão de obra zero e peças "a definir", sem estoque', async () => {
    const r = await carregarCatalogoInicial(db);
    expect(r.servicos).toEqual({ criados: SERVICOS_INICIAIS.length, jaExistiam: 0 });
    expect(r.pecas).toEqual({ criados: PECAS_INICIAIS.length, jaExistiam: 0 });

    expect(await db.servico.count({ where: { precoMaoDeObra: { not: 0 } } })).toBe(0);
    const pecas = await db.peca.findMany();
    expect(pecas.every((p) => p.precoADefinir && Number(p.precoVenda) === 0 && Number(p.estoqueAtual) === 0)).toBe(true);
  });

  it('carregar de novo não duplica; o que a oficina já tinha (mesmo desativado) fica como está', async () => {
    await db.servico.create({ data: { nome: 'troca de óleo e filtro', precoMaoDeObra: 90 } });
    await db.peca.create({ data: { nome: 'Filtro de óleo', precoCusto: 15, precoVenda: 30, ativo: false } });

    const primeira = await carregarCatalogoInicial(db);
    expect(primeira.servicos.jaExistiam).toBe(1);
    expect(primeira.pecas.jaExistiam).toBe(1);
    expect(Number((await db.servico.findFirstOrThrow({ where: { nome: 'troca de óleo e filtro' } })).precoMaoDeObra)).toBe(90);

    const segunda = await carregarCatalogoInicial(db);
    expect(segunda.servicos.criados + segunda.pecas.criados).toBe(0);
    expect(await db.servico.count()).toBe(SERVICOS_INICIAIS.length);
  });
});

describe('serviço sem preço de tabela no orçamento (RN-08)', () => {
  it('o preço combinado vale como tabela: não encobre desconto dado nos outros itens', async () => {
    const base = await cenarioBase({ precoServico: 1000 });
    const avulsa = await db.servico.create({ data: { nome: 'Mão de obra avulsa', precoMaoDeObra: 0 } });
    // Troca de óleo 20% abaixo da tabela; o teto sem senha é 10%.
    await expect(
      orcamentos.criar(
        {
          clienteId: base.cliente.id,
          carroId: base.carro.id,
          desconto: 0,
          servicos: [
            { servicoId: base.servico.id, quantidade: 1, precoUnit: 800 },
            { servicoId: avulsa.id, quantidade: 1, precoUnit: 500 },
          ],
          pecas: [],
        },
        a.atendente,
      ),
    ).rejects.toMatchObject({ codigo: 'SENHA_DONO_NECESSARIA' });
  });

  it('só com a mão de obra combinada, sem desconto, passa sem senha', async () => {
    const base = await cenarioBase();
    const avulsa = await db.servico.create({ data: { nome: 'Mão de obra avulsa', precoMaoDeObra: 0 } });
    const orc = await orcamentos.criar(
      { clienteId: base.cliente.id, carroId: base.carro.id, desconto: 0, servicos: [{ servicoId: avulsa.id, quantidade: 1, precoUnit: 250 }], pecas: [] },
      a.atendente,
    );
    expect(orc.total).toBe(250);
  });
});

describe('rota', () => {
  let app: App;
  const cookieDe = (r: LightMyRequestResponse) => {
    const c = r.cookies.find((x) => x.name === 'hermes_sessao');
    return c ? `hermes_sessao=${c.value}` : '';
  };
  const entrar = async (email: string) =>
    cookieDe(await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, senha: SENHA_PADRAO } }));

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('é do Dono: o atendente recebe 403', async () => {
    const url = '/api/oficina/catalogo-inicial';
    const negado = await app.inject({ method: 'POST', url, headers: { cookie: await entrar(a.atendente.email) } });
    expect(negado.statusCode).toBe(403);

    const ok = await app.inject({ method: 'POST', url, headers: { cookie: await entrar(a.dono.email) } });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().servicos.criados).toBe(SERVICOS_INICIAIS.length);
  });
});

afterAll(async () => {
  await db.$disconnect();
});
