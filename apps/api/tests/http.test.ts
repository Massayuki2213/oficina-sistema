import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { LightMyRequestResponse } from 'fastify';
import { buildApp, type App } from '../src/app.js';
import { env } from '../src/lib/env.js';
import { db, limparDominio, configPadrao, atores, usuario, SENHA_PADRAO } from './ajuda.js';

// ============================================================
// A API vista de fora: cookie de sessão, quem pode o quê, formato
// dos erros. É o que garante que a tela esconder um botão não é a
// única coisa entre o mecânico e o livro-caixa.
// ============================================================

let app: App;
let a: Awaited<ReturnType<typeof atores>>;

const cookieDe = (r: LightMyRequestResponse) => {
  const c = r.cookies.find((x) => x.name === 'hermes_sessao');
  return c ? `hermes_sessao=${c.value}` : '';
};

async function entrar(email: string, senha = SENHA_PADRAO) {
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, senha } });
  expect(r.statusCode, r.body).toBe(200);
  return cookieDe(r);
}

const get = (url: string, cookie: string) => app.inject({ method: 'GET', url, headers: { cookie } });

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  a = await atores();
});
beforeEach(async () => {
  await limparDominio();
  await configPadrao();
  a = await atores();
});
afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

describe('sessão por cookie', () => {
  it('login devolve cookie httpOnly e SameSite=Strict — e o token não vem no corpo', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: a.dono.email, senha: SENHA_PADRAO } });
    expect(r.statusCode).toBe(200);
    const c = r.cookies.find((x) => x.name === 'hermes_sessao')!;
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe('Strict');
    expect(r.json().usuario.perfil).toBe('DONO');
    expect(r.body).not.toContain(c.value);
  });

  it('sem sessão: 401 com código', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/clientes' });
    expect(r.statusCode).toBe(401);
    expect(r.json()).toMatchObject({ codigo: 'NAO_AUTENTICADO' });
  });

  it('senha errada: 401 e fica no log de auditoria', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: a.dono.email, senha: 'errada' } });
    expect(r.statusCode).toBe(401);
    expect(await db.logAuditoria.count({ where: { acao: 'LOGIN_FALHOU' } })).toBe(1);
  });

  it('o Dono redefiniu a senha: a sessão antiga da pessoa cai na hora', async () => {
    const atendente = await entrar(a.atendente.email);
    expect((await get('/api/clientes', atendente)).statusCode).toBe(200);

    const dono = await entrar(a.dono.email);
    const r = await app.inject({
      method: 'PATCH',
      url: `/api/usuarios/${a.atendente.id}/senha`,
      headers: { cookie: dono },
      payload: { senha: 'outra-senha-forte' },
    });
    expect(r.statusCode).toBe(204);

    const depois = await get('/api/clientes', atendente);
    expect(depois.statusCode).toBe(401);
  });

  it('usuário inativado perde o acesso mesmo com o token válido', async () => {
    const atendente = await entrar(a.atendente.email);
    await db.usuario.update({ where: { id: a.atendente.id }, data: { ativo: false } });
    expect((await get('/api/clientes', atendente)).statusCode).toBe(401);
  });

  it('trocar a própria senha mantém esta sessão (cookie novo) e derruba as outras', async () => {
    const primeira = await entrar(a.atendente.email);
    const r = await app.inject({
      method: 'PATCH',
      url: '/api/usuarios/minha-senha',
      headers: { cookie: primeira },
      payload: { senhaAtual: SENHA_PADRAO, novaSenha: 'nova-senha-123' },
    });
    expect(r.statusCode).toBe(204);
    const nova = cookieDe(r);
    expect(nova).not.toBe('');
    expect((await get('/api/auth/me', nova)).statusCode).toBe(200);
    expect((await get('/api/auth/me', primeira)).statusCode).toBe(401);
    await usuario('ATENDENTE'); // devolve a senha padrão para os próximos testes
  });

  it('logout apaga o cookie E encerra a sessão no servidor — o token copiado não serve mais', async () => {
    const sessao = await entrar(a.atendente.email);
    const r = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: sessao } });
    expect(r.statusCode).toBe(204);
    expect(r.cookies.find((x) => x.name === 'hermes_sessao')?.value).toBe('');

    const depois = await get('/api/auth/me', sessao);
    expect(depois.statusCode).toBe(401);
    expect(depois.json().message).toMatch(/encerrada/);
  });
});

describe('sessões guardadas no banco (ADR 0009)', () => {
  const token = (cookie: string) => cookie.replace('hermes_sessao=', '');

  it('o banco guarda só o hash do token — quem lê o banco não entra', async () => {
    const sessao = await entrar(a.atendente.email);
    const linhas = await db.sessao.findMany({ where: { usuarioId: a.atendente.id } });
    expect(linhas).toHaveLength(1);
    expect(JSON.stringify(linhas)).not.toContain(token(sessao));
    // O hash no lugar do token: não autentica.
    const r = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: `hermes_sessao=${linhas[0].tokenHash}` } });
    expect(r.statusCode).toBe(401);
  });

  it('o token também vale como Bearer (integrações)', async () => {
    const sessao = await entrar(a.atendente.email);
    const r = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${token(sessao)}` } });
    expect(r.statusCode).toBe(200);
    expect(r.json().email).toBe(a.atendente.email);
  });

  it('lista os meus aparelhos, marca o atual e descreve o navegador', async () => {
    const edge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0';
    const r1 = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'user-agent': edge },
      payload: { email: a.atendente.email, senha: SENHA_PADRAO },
    });
    const noEdge = cookieDe(r1);
    await entrar(a.atendente.email); // um segundo aparelho
    await entrar(a.mecanico.email); // de outra pessoa: não aparece

    const lista = (await get('/api/auth/sessoes', noEdge)).json();
    expect(lista).toHaveLength(2);
    const atual = lista.find((s: { atual: boolean }) => s.atual);
    expect(atual.aparelho).toBe('Edge no Windows');
    expect(lista.filter((s: { atual: boolean }) => s.atual)).toHaveLength(1);
  });

  it('sair de um aparelho: aquele token cai, este continua', async () => {
    const aqui = await entrar(a.atendente.email);
    const la = await entrar(a.atendente.email);
    const lista = (await get('/api/auth/sessoes', aqui)).json();
    const outra = lista.find((s: { atual: boolean }) => !s.atual);

    const r = await app.inject({ method: 'DELETE', url: `/api/auth/sessoes/${outra.id}`, headers: { cookie: aqui } });
    expect(r.statusCode).toBe(204);
    expect((await get('/api/auth/me', la)).statusCode).toBe(401);
    expect((await get('/api/auth/me', aqui)).statusCode).toBe(200);
  });

  it('ninguém encerra a sessão de outra pessoa por esta rota', async () => {
    const atendente = await entrar(a.atendente.email);
    const mecanico = await entrar(a.mecanico.email);
    const doMecanico = (await get('/api/auth/sessoes', mecanico)).json()[0];

    const r = await app.inject({ method: 'DELETE', url: `/api/auth/sessoes/${doMecanico.id}`, headers: { cookie: atendente } });
    expect(r.statusCode).toBe(404);
    expect((await get('/api/auth/me', mecanico)).statusCode).toBe(200);
  });

  it('"sair dos outros aparelhos" mantém só este', async () => {
    const aqui = await entrar(a.atendente.email);
    const outros = [await entrar(a.atendente.email), await entrar(a.atendente.email)];
    const r = await app.inject({ method: 'POST', url: '/api/auth/sessoes/encerrar-outras', headers: { cookie: aqui } });
    expect(r.json().encerradas).toBe(2);
    for (const c of outros) expect((await get('/api/auth/me', c)).statusCode).toBe(401);
    expect((await get('/api/auth/me', aqui)).statusCode).toBe(200);
  });

  it('o Dono derruba os aparelhos de alguém (celular perdido) — a senha continua a mesma', async () => {
    const celular = await entrar(a.atendente.email);
    const dono = await entrar(a.dono.email);
    expect((await get('/api/usuarios', dono)).json().find((u: { id: string }) => u.id === a.atendente.id).sessoesAtivas).toBe(1);

    const r = await app.inject({ method: 'POST', url: `/api/usuarios/${a.atendente.id}/encerrar-sessoes`, headers: { cookie: dono } });
    expect(r.json().encerradas).toBe(1);
    expect((await get('/api/auth/me', celular)).statusCode).toBe(401);
    await entrar(a.atendente.email); // mesma senha
    expect((await db.logAuditoria.findFirst({ where: { acao: 'ENCERRAR_SESSOES' } }))?.usuarioId).toBe(a.dono.id);
  });

  it('parada além do tempo sem uso: expira, com a mensagem certa', async () => {
    const sessao = await entrar(a.atendente.email);
    const HORA = 3_600_000;
    await db.sessao.updateMany({
      where: { usuarioId: a.atendente.id },
      data: { criadaEm: new Date(Date.now() - 14 * HORA), ultimoUso: new Date(Date.now() - 13 * HORA), expiraEm: new Date(Date.now() - HORA) },
    });
    const r = await get('/api/auth/me', sessao);
    expect(r.statusCode).toBe(401);
    expect(r.json().message).toMatch(/expirou/);
  });

  it('usar renova a validade — mas nunca além de 7 dias desde o login', async () => {
    const sessao = await entrar(a.atendente.email);
    const agora = Date.now();
    const HORA = 3_600_000;

    // Uso há 10 min e vencendo em 1 min: a requisição empurra para a duração
    // configurada (SESSAO_DURACAO, 12h por padrão) a partir de agora.
    await db.sessao.updateMany({
      where: { usuarioId: a.atendente.id },
      data: { ultimoUso: new Date(agora - 10 * 60_000), expiraEm: new Date(agora + 60_000) },
    });
    expect((await get('/api/auth/me', sessao)).statusCode).toBe(200);
    let s = await db.sessao.findFirstOrThrow({ where: { usuarioId: a.atendente.id } });
    expect(s.expiraEm.getTime()).toBeGreaterThanOrEqual(agora + env.sessaoDuracaoMs);

    // Login há quase 7 dias: a renovação para no limite absoluto (daqui a 1h).
    await db.sessao.updateMany({
      where: { usuarioId: a.atendente.id },
      data: { criadaEm: new Date(agora - 7 * 24 * HORA + HORA), ultimoUso: new Date(agora - 10 * 60_000), expiraEm: new Date(agora + 60_000) },
    });
    expect((await get('/api/auth/me', sessao)).statusCode).toBe(200);
    s = await db.sessao.findFirstOrThrow({ where: { usuarioId: a.atendente.id } });
    expect(s.expiraEm.getTime()).toBeLessThanOrEqual(agora + HORA + 5_000);
  });
});

describe('quem pode o quê (o servidor decide, não a tela)', () => {
  it.each([
    ['/api/caixa', 403],
    ['/api/relatorios/resumo', 403],
    ['/api/despesas', 403],
    ['/api/clientes', 403],
    ['/api/orcamentos', 403],
    ['/api/usuarios', 403],
    ['/api/auditoria', 403],
    ['/api/contas-receber', 403],
    ['/api/ordens', 200],
    ['/api/agenda', 200],
    ['/api/pecas', 200],
  ])('mecânico em %s → %i', async (url, status) => {
    const mecanico = await entrar(a.mecanico.email);
    expect((await get(url, mecanico)).statusCode).toBe(status);
  });

  it.each([
    ['/api/caixa', 403],
    ['/api/relatorios/resumo', 403],
    ['/api/usuarios', 403],
    ['/api/clientes', 200],
    ['/api/orcamentos', 200],
    ['/api/contas-receber', 200],
  ])('atendente em %s → %i', async (url, status) => {
    const atendente = await entrar(a.atendente.email);
    expect((await get(url, atendente)).statusCode).toBe(status);
  });

  it('atendente não vê custo da peça; o Dono vê', async () => {
    await db.peca.create({ data: { nome: 'Vela', precoCusto: 10, precoVenda: 25 } });
    const atendente = await entrar(a.atendente.email);
    const dono = await entrar(a.dono.email);
    expect((await get('/api/pecas', atendente)).json().itens[0].precoCusto).toBeNull();
    expect((await get('/api/pecas', dono)).json().itens[0].precoCusto).toBe(10);
  });
});

describe('formato dos erros', () => {
  it('validação: 400 com a primeira mensagem e os erros por campo', async () => {
    const dono = await entrar(a.dono.email);
    const r = await app.inject({
      method: 'POST',
      url: '/api/clientes',
      headers: { cookie: dono },
      payload: { nome: 'A', cpfCnpj: '111.111.111-11', email: 'nao-e-email' },
    });
    expect(r.statusCode).toBe(400);
    const corpo = r.json();
    expect(corpo.codigo).toBe('VALIDACAO');
    expect(corpo.message).toBe('Informe o nome (ao menos 2 letras)');
    expect(Object.keys(corpo.erros)).toEqual(expect.arrayContaining(['nome', 'cpfCnpj', 'email']));
  });

  it('JSON com __proto__ é recusado (prototype poisoning)', async () => {
    const dono = await entrar(a.dono.email);
    const r = await app.inject({
      method: 'POST',
      url: '/api/clientes',
      headers: { cookie: dono, 'content-type': 'application/json' },
      payload: '{"nome":"Ana","__proto__":{"admin":true}}',
    });
    expect(r.statusCode).toBe(400);
  });

  it('rota inexistente da API: 404 em JSON', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/nao-existe' });
    expect(r.statusCode).toBe(404);
    expect(r.json().codigo).toBe('NAO_ENCONTRADO');
  });

  it('placa duplicada vira mensagem clara (409)', async () => {
    const dono = await entrar(a.dono.email);
    const cli = (await app.inject({ method: 'POST', url: '/api/clientes', headers: { cookie: dono }, payload: { nome: 'Ana' } })).json();
    const carro = { clienteId: cli.id, placa: 'ABC-1234', marca: 'VW', modelo: 'Gol' };
    expect((await app.inject({ method: 'POST', url: '/api/carros', headers: { cookie: dono }, payload: carro })).statusCode).toBe(201);
    const dup = await app.inject({ method: 'POST', url: '/api/carros', headers: { cookie: dono }, payload: carro });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().message).toMatch(/placa/);
  });
});

describe('auditoria pelo hook', () => {
  type Mudanca = { campo: string; de: string; para: string };
  const mudancasDe = async (where: { entidade: string; acao: string }) =>
    ((await db.logAuditoria.findFirstOrThrow({ where, orderBy: { data: 'desc' } })).mudancas ?? []) as Mudanca[];
  const mudanca = (lista: Mudanca[], campo: string) => lista.find((m) => m.campo === campo);

  it('toda alteração bem-sucedida fica registrada com quem fez', async () => {
    const atendente = await entrar(a.atendente.email);
    await app.inject({ method: 'POST', url: '/api/clientes', headers: { cookie: atendente }, payload: { nome: 'Cliente Auditado' } });
    const log = await db.logAuditoria.findFirstOrThrow({ where: { entidade: 'clientes', acao: 'CRIAR' } });
    expect(log.usuarioId).toBe(a.atendente.id);
    expect(log.detalhes).toContain('Cliente Auditado');
  });

  it('guarda o valor ANTERIOR: quem baixou o preço da peça, de quanto para quanto', async () => {
    const peca = await db.peca.create({ data: { nome: 'Pastilha de freio', precoCusto: 40, precoVenda: 80 } });
    const dono = await entrar(a.dono.email);
    const r = await app.inject({
      method: 'PUT',
      url: `/api/pecas/${peca.id}`,
      headers: { cookie: dono },
      payload: { nome: 'Pastilha de freio', precoCusto: 40, precoVenda: 50 },
    });
    expect(r.statusCode).toBe(200);

    const m = await mudancasDe({ entidade: 'pecas', acao: 'ALTERAR' });
    expect(mudanca(m, 'Preço de venda')).toMatchObject({ de: expect.stringMatching(/R\$\s80,00/), para: expect.stringMatching(/R\$\s50,00/) });
    expect(mudanca(m, 'Nome')).toBeUndefined(); // o que não mudou não aparece
  });

  it('ações também: a situação da OS, de → para', async () => {
    const cli = await db.cliente.create({ data: { nome: 'Ana' } });
    const carro = await db.carro.create({ data: { clienteId: cli.id, placa: 'AUD1A23', marca: 'VW', modelo: 'Gol' } });
    const os = await db.ordemServico.create({ data: { clienteId: cli.id, carroId: carro.id } });
    const atendente = await entrar(a.atendente.email);
    await app.inject({ method: 'PATCH', url: `/api/ordens/${os.id}/status`, headers: { cookie: atendente }, payload: { status: 'EM_EXECUCAO' } });

    expect(mudanca(await mudancasDe({ entidade: 'ordens', acao: 'STATUS' }), 'Situação')).toEqual({
      campo: 'Situação',
      de: 'Aberta',
      para: 'Em execução',
    });
  });

  it('regra da oficina: "desconto sem senha 10% → 25%" fica à vista', async () => {
    const dono = await entrar(a.dono.email);
    await app.inject({
      method: 'PUT',
      url: '/api/oficina',
      headers: { cookie: dono },
      payload: { nome: 'Oficina de Teste', margemPadrao: 80, descontoMaxSemSenha: 25, garantiaDias: 15, validadeOrcamentoDias: 15 },
    });
    expect(mudanca(await mudancasDe({ entidade: 'oficina', acao: 'ALTERAR' }), 'Desconto sem senha do Dono')).toEqual({
      campo: 'Desconto sem senha do Dono',
      de: '10%',
      para: '25%',
    });
  });

  it('dado pessoal do cliente: registra que mudou, nunca o valor', async () => {
    const cli = await db.cliente.create({ data: { nome: 'Bia', telefone: '11911112222' } });
    const atendente = await entrar(a.atendente.email);
    await app.inject({
      method: 'PUT',
      url: `/api/clientes/${cli.id}`,
      headers: { cookie: atendente },
      payload: { nome: 'Bia', telefone: '(11) 93333-4444' },
    });
    const log = await db.logAuditoria.findFirstOrThrow({ where: { entidade: 'clientes', acao: 'ALTERAR' } });
    expect(JSON.stringify(log)).not.toMatch(/1111|2222|3333|4444/);
    expect(mudanca(log.mudancas as Mudanca[], 'Telefone')).toEqual({ campo: 'Telefone', de: '(dado pessoal)', para: '(alterado)' });
  });

  it('anonimizar (LGPD) tira do histórico o que foi enviado sobre a pessoa', async () => {
    const dono = await entrar(a.dono.email);
    const cli = (await app.inject({ method: 'POST', url: '/api/clientes', headers: { cookie: dono }, payload: { nome: 'Carlos Sigiloso', email: 'carlos@ex.com' } })).json();
    const r = await app.inject({ method: 'POST', url: `/api/clientes/${cli.id}/anonimizar`, headers: { cookie: dono } });
    expect(r.statusCode).toBe(204);

    const logs = await db.logAuditoria.findMany({ where: { entidade: 'clientes', entidadeId: cli.id } });
    expect(logs.map((l) => l.acao).sort()).toEqual(['ANONIMIZAR', 'CRIAR']); // o fato continua
    expect(JSON.stringify(logs)).not.toMatch(/Carlos|carlos@ex/); // o conteúdo, não
  });

  it('o Histórico devolve as mudanças para a tela', async () => {
    const peca = await db.peca.create({ data: { nome: 'Vela', precoCusto: 10, precoVenda: 25 } });
    const dono = await entrar(a.dono.email);
    await app.inject({ method: 'PUT', url: `/api/pecas/${peca.id}`, headers: { cookie: dono }, payload: { nome: 'Vela', precoCusto: 10, precoVenda: 30 } });
    const lista = (await get('/api/auditoria?entidade=pecas', dono)).json();
    expect(lista.itens[0].mudancas).toEqual([
      { campo: 'Preço de venda', de: expect.stringMatching(/25,00/), para: expect.stringMatching(/30,00/) },
      expect.objectContaining({ campo: 'Margem' }),
    ]);
  });
});

describe('primeiro acesso', () => {
  it('só funciona com o banco sem usuários, e já entra como Dono', async () => {
    const comUsuarios = await app.inject({
      method: 'POST',
      url: '/api/auth/primeiro-acesso',
      payload: { oficinaNome: 'Oficina X', nome: 'Ana', email: 'ana@x.com', senha: 'senha-forte-1' },
    });
    expect(comUsuarios.statusCode).toBe(409);
    expect(comUsuarios.json().codigo).toBe('JA_CONFIGURADO');

    await db.usuario.deleteMany();
    expect((await app.inject({ method: 'GET', url: '/api/auth/situacao' })).json().precisaConfigurar).toBe(true);

    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/primeiro-acesso',
      payload: { oficinaNome: 'Oficina X', nome: 'Ana', email: 'ana@x.com', senha: 'senha-forte-1' },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().usuario.perfil).toBe('DONO');
    expect((await get('/api/auth/me', cookieDe(r))).statusCode).toBe(200);
    expect((await db.oficina.findUniqueOrThrow({ where: { id: 'unica' } })).nome).toBe('Oficina X');

    await db.usuario.deleteMany();
    a = await atores(); // devolve os usuários de teste
  });
});

describe('limite de tentativas no login', () => {
  it('10 senhas erradas seguidas para a mesma conta: bloqueia (429)', async () => {
    const tentar = () => app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'alvo@x.com', senha: 'chute' } });
    for (let i = 0; i < 10; i++) expect((await tentar()).statusCode).toBe(401);
    const bloqueado = await tentar();
    expect(bloqueado.statusCode).toBe(429);
    expect(bloqueado.json().codigo).toBe('MUITAS_TENTATIVAS');
  });

  it('login certo não conta — o balcão inteiro sai pelo mesmo IP', async () => {
    for (let i = 0; i < 15; i++) await entrar(a.atendente.email);
    expect((await get('/api/auth/me', await entrar(a.atendente.email))).statusCode).toBe(200);
  });
});
