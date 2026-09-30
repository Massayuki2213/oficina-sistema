import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PERMISSOES, type UsuarioSessao } from '@hermes/shared';
import { buildApp, type App } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { descreverAparelho } from '../src/lib/sessoes.js';
import * as orcamentos from '../src/modules/orcamentos/orcamentos.service.js';
import { db, limparDominio, configPadrao, cenarioBase, usuario, type Base } from './ajuda.js';

// ============================================================
// As defesas que não aparecem na tela: toda rota fechada por
// padrão, freio na senha do Dono, o servidor sem poder de dono
// no banco e o banco recusando dado que nunca deveria existir.
// ============================================================

// ---- Negar por padrão ---------------------------------------------------------

/** As ÚNICAS rotas da API abertas sem sessão. Rota nova pública = mudar aqui, de propósito. */
const PUBLICAS = [
  'GET /api/health',
  'GET /api/auth/situacao',
  'POST /api/auth/login',
  'POST /api/auth/primeiro-acesso',
  'POST /api/auth/logout',
].sort();

describe('negar por padrão', () => {
  let app: App;
  const rotas: { metodo: string; url: string; publica: boolean }[] = [];

  beforeAll(async () => {
    app = await buildApp({
      aoRegistrarRota: (r) => {
        if (!r.url.startsWith('/api/') || r.url.startsWith('/api/docs')) return;
        for (const metodo of [r.method].flat()) {
          if (metodo !== 'HEAD') rotas.push({ metodo, url: r.url, publica: r.config?.publica === true });
        }
      },
    });
    await app.ready();
  });
  afterAll(() => app.close());

  it('só as rotas de entrada e a de saúde são públicas', () => {
    expect(rotas.length).toBeGreaterThan(80);
    const publicas = rotas.filter((r) => r.publica).map((r) => `${r.metodo} ${r.url}`);
    expect(publicas.sort()).toEqual(PUBLICAS);
  });

  it('todas as outras respondem 401 sem sessão — antes de validar ou tocar no banco', async () => {
    const abertas: string[] = [];
    for (const r of rotas.filter((x) => !x.publica)) {
      const url = r.url.replace(/:[A-Za-z]+/g, 'qualquer');
      const res = await app.inject({ method: r.metodo as 'GET', url, payload: r.metodo === 'GET' || r.metodo === 'DELETE' ? undefined : {} });
      if (res.statusCode !== 401 || res.json().codigo !== 'NAO_AUTENTICADO') abertas.push(`${r.metodo} ${r.url} → ${res.statusCode}`);
    }
    expect(abertas).toEqual([]);
  });
});

// ---- Senha do Dono (RN-08) ------------------------------------------------------

describe('freio na senha do Dono', () => {
  const SENHA_DONO = 'senha-do-dono';
  let base: Base;
  let balconista: UsuarioSessao;

  /** Um atendente só deste teste: o freio conta por pessoa, e fica em memória. */
  async function novoAtendente(): Promise<UsuarioSessao> {
    const email = `freio.${Date.now()}.${Math.random().toString(36).slice(2)}@hermes.local`;
    const u = await db.usuario.create({ data: { nome: 'Balconista do Freio', email, senhaHash: 'x', perfil: 'ATENDENTE' } });
    return { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, permissoes: PERMISSOES[u.perfil] };
  }

  // 60 de desconto sobre 200 = 30%, acima do teto de 10%: pede a senha do Dono.
  const descontoAlto = (senhaDono: string, ator = balconista) =>
    orcamentos.criar(
      {
        clienteId: base.cliente.id,
        carroId: base.carro.id,
        desconto: 60,
        senhaDono,
        servicos: [{ servicoId: base.servico.id, quantidade: 1 }],
        pecas: [{ pecaId: base.peca.id, quantidade: 2 }],
      },
      ator,
    );

  beforeAll(async () => {
    await usuario('DONO', SENHA_DONO);
  });
  beforeEach(async () => {
    await limparDominio();
    await configPadrao();
    base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    balconista = await novoAtendente();
  });
  afterAll(async () => {
    await usuario('DONO'); // devolve a senha padrão
    await limparDominio(); // o histórico aponta para os atendentes deste teste
    await db.usuario.deleteMany({ where: { email: { startsWith: 'freio.' } } });
  });

  it('5 erros seguidos travam a pessoa — nem a senha certa passa enquanto isso', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(descontoAlto('chute')).rejects.toMatchObject({ statusCode: 403, codigo: 'SENHA_DONO_INCORRETA' });
    }
    await expect(descontoAlto('chute')).rejects.toMatchObject({ statusCode: 429, codigo: 'MUITAS_TENTATIVAS' });
    await expect(descontoAlto(SENHA_DONO)).rejects.toMatchObject({ statusCode: 429 });
  });

  it('o freio é por pessoa: outro atendente continua podendo pedir a senha', async () => {
    for (let i = 0; i < 5; i++) await descontoAlto('chute').catch(() => {});
    const outro = await novoAtendente();
    await expect(descontoAlto(SENHA_DONO, outro)).resolves.toMatchObject({ total: 140 });
  });

  it('acertar zera a conta', async () => {
    for (let i = 0; i < 4; i++) await descontoAlto('chute').catch(() => {});
    await descontoAlto(SENHA_DONO);
    for (let i = 0; i < 4; i++) await descontoAlto('chute').catch(() => {});
    await expect(descontoAlto(SENHA_DONO)).resolves.toMatchObject({ total: 140 });
  });

  it('cada erro fica no Histórico, com quem tentou', async () => {
    await descontoAlto('chute').catch(() => {});
    await descontoAlto('outro chute').catch(() => {});
    const logs = await db.logAuditoria.findMany({ where: { acao: 'SENHA_DONO_INCORRETA' } });
    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.usuarioId === balconista.id)).toBe(true);
    // O que foi digitado nunca vai para o log.
    expect(logs.some((l) => l.detalhes?.includes('chute'))).toBe(false);
  });
});

// ---- Menor privilégio no banco --------------------------------------------------

describe('o servidor não é dono do banco', () => {
  it('conecta como hermes_app, sem superusuário', async () => {
    const [eu] = await prisma.$queryRaw<{ usuario: string; superusuario: boolean }[]>`
      SELECT current_user::text AS usuario, rolsuper AS superusuario FROM pg_roles WHERE rolname = current_user`;
    expect(eu).toEqual({ usuario: 'hermes_app', superusuario: false });
  });

  it.each([
    'DROP TABLE clientes',
    'TRUNCATE clientes',
    'ALTER TABLE clientes ADD COLUMN invasao int',
    'CREATE TABLE invasao (id int)',
    "COPY (SELECT 1) TO PROGRAM 'id'",
    'CREATE ROLE invasor LOGIN',
  ])('recusa: %s', async (sql) => {
    await expect(prisma.$executeRawUnsafe(sql)).rejects.toThrow(/permission denied|must be owner|must be superuser|pg_execute_server_program/);
  });
});

// ---- Restrições do banco --------------------------------------------------------

describe('o banco recusa o que nunca deveria existir', () => {
  beforeEach(async () => {
    await limparDominio();
    await configPadrao();
  });

  it.each([
    ['despesa negativa', () => prisma.despesa.create({ data: { categoria: 'Luz', descricao: 'x', valor: -1 } })],
    ['lançamento de caixa zerado', () => prisma.lancamentoCaixa.create({ data: { tipo: 'ENTRADA', origem: 'OS', descricao: 'x', valor: 0 } })],
    ['peça com preço negativo', () => prisma.peca.create({ data: { nome: 'x', precoCusto: -5, precoVenda: 10 } })],
    ['teto de desconto acima de 100%', () => prisma.oficina.update({ where: { id: 'unica' }, data: { descontoMaxSemSenha: 150 } })],
  ])('%s', async (_nome, gravar) => {
    await expect(gravar()).rejects.toThrow(/violates check constraint/);
  });

  it('parcela paga além do valor', async () => {
    const { cliente } = await cenarioBase();
    await expect(
      prisma.contaReceber.create({ data: { clienteId: cliente.id, vencimento: new Date(), valor: 100, valorPago: 150 } }),
    ).rejects.toThrow(/contas_receber_valor_check/);
  });

  it('OS cujo total não fecha com subtotal − desconto (RN-09)', async () => {
    const { cliente, carro } = await cenarioBase();
    await expect(
      prisma.ordemServico.create({ data: { clienteId: cliente.id, carroId: carro.id, subtotal: 100, desconto: 10, total: 100 } }),
    ).rejects.toThrow(/ordens_servico_total_check/);
  });

  it('a API responde 400 com mensagem clara, e não 500', async () => {
    const app = await buildApp();
    // Rota só deste teste, fora do /api: simula um bug que escapou da validação.
    app.post('/teste/grava-errado', () => prisma.despesa.create({ data: { categoria: 'x', descricao: 'x', valor: -1 } }));
    await app.ready();
    const r = await app.inject({ method: 'POST', url: '/teste/grava-errado' });
    await app.close();
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ codigo: 'VALIDACAO', message: expect.stringMatching(/nada foi gravado/) });
    expect(r.body).not.toMatch(/Failing row/);
  });
});

// ---- Nome do aparelho na lista de sessões -----------------------------------------

describe('descreverAparelho', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0', 'Edge no Windows'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) hermes-janela/1.0.0 Chrome/138.0 Electron/38.8.6 Safari/537.36', 'App Hermes no Windows'],
    ['Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36', 'Chrome no Android'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'Safari no iPhone/iPad'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5; rv:130.0) Gecko/20100101 Firefox/130.0', 'Firefox no Mac'],
    ['curl/8.9.1', 'Navegador'],
  ])('%s → %s', (ua, esperado) => {
    expect(descreverAparelho(ua)).toBe(esperado);
  });

  it('sem user-agent: sem descrição', () => {
    expect(descreverAparelho(undefined)).toBeNull();
  });
});

afterAll(async () => {
  await db.$disconnect();
});
