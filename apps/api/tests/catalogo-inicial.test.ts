import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { LightMyRequestResponse } from 'fastify';
import { buildApp, type App } from '../src/app.js';
import { db, limparDominio, configPadrao, cenarioBase, atores, SENHA_PADRAO } from './ajuda.js';
import { CATEGORIAS_PECA } from '@hermes/shared';
import { listarPecasQuery } from '@hermes/shared/schemas';
import { PECAS_INICIAIS, SERVICOS_INICIAIS, carregarCatalogoInicial } from '../src/dominio/catalogo-inicial.js';
import * as orcamentos from '../src/modules/orcamentos/orcamentos.service.js';
import * as pecas from '../src/modules/pecas/pecas.service.js';

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
    expect(r.pecas).toEqual({ criados: PECAS_INICIAIS.length, jaExistiam: 0, categorizadas: 0 });

    expect(await db.servico.count({ where: { precoMaoDeObra: { not: 0 } } })).toBe(0);
    const pecas = await db.peca.findMany();
    expect(pecas.every((p) => p.precoADefinir && Number(p.precoVenda) === 0 && Number(p.estoqueAtual) === 0)).toBe(true);
  });

  it('toda peça entra com uma das categorias sugeridas', async () => {
    await carregarCatalogoInicial(db);
    expect(await db.peca.count({ where: { categoria: null } })).toBe(0);
    expect(await pecas.categorias()).toEqual([...CATEGORIAS_PECA].sort((a, b) => (a < b ? -1 : 1)));
  });

  it('carregar de novo dá categoria à peça do catálogo que estava sem — e não troca a que já tinha', async () => {
    await db.peca.create({ data: { nome: 'Bieleta', precoCusto: 0, precoVenda: 0 } });
    await db.peca.create({ data: { nome: 'Bateria 60 Ah', precoCusto: 0, precoVenda: 0, categoria: 'Baterias' } });
    const r = await carregarCatalogoInicial(db);
    expect(r.pecas.categorizadas).toBe(1);
    expect((await db.peca.findFirstOrThrow({ where: { nome: 'Bieleta' } })).categoria).toBe('Suspensão');
    expect((await db.peca.findFirstOrThrow({ where: { nome: 'Bateria 60 Ah' } })).categoria).toBe('Baterias');
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

describe('filtro do estoque por categoria', () => {
  const listar = (q: Record<string, string>) => pecas.listar(listarPecasQuery.parse({ porPagina: '100', ...q }), a.dono);

  it('filtra pela categoria, acha as sem categoria e a busca também olha a categoria', async () => {
    await carregarCatalogoInicial(db);
    await db.peca.create({ data: { nome: 'Peça avulsa', precoCusto: 0, precoVenda: 0 } });

    const freios = await listar({ categoria: 'freios' });
    expect(freios.total).toBe(PECAS_INICIAIS.filter((p) => p.categoria === 'Freios').length);
    expect(freios.itens.every((p) => p.categoria === 'Freios')).toBe(true);

    const sem = await listar({ semCategoria: 'true' });
    expect(sem.itens.map((p) => p.nome)).toEqual(['Peça avulsa']);

    const busca = await listar({ busca: 'iluminação' });
    expect(busca.total).toBe(PECAS_INICIAIS.filter((p) => p.categoria === 'Iluminação').length);
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
