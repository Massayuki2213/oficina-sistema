// ============================================================
// Cenário de DEMONSTRAÇÃO — 6 meses de uma oficina funcionando.
//
// ⚠️ APAGA os dados de operação (clientes, OS, caixa, estoque...) e
// recria tudo. Serve para conhecer o sistema e para apresentar. Em
// produção ele se recusa a rodar (use --forcar só se souber o que faz).
//
// Os dados são criados pelos PRÓPRIOS services da API — a mesma regra
// que roda no balcão —, então estoque, kardex e caixa fecham entre si.
// Tudo entra numa fila única, do mais antigo para o mais novo, e cada
// acontecimento é "empurrado" para a data em que teria acontecido.
//
//   npm run db:seed
// ============================================================

import { PrismaClient, type PerfilUsuario } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PERMISSOES, type UsuarioSessao } from '@hermes/shared';
import * as ordens from '../src/modules/ordens/ordens.service.js';
import * as orcamentos from '../src/modules/orcamentos/orcamentos.service.js';
import * as compras from '../src/modules/compras/compras.service.js';
import * as vendas from '../src/modules/vendas/vendas.service.js';
import * as despesas from '../src/modules/despesas/despesas.service.js';
import * as contas from '../src/modules/contas/contas.service.js';
import * as caixa from '../src/modules/caixa/caixa.service.js';
import { ajustar } from '../src/dominio/estoque.js';

const prisma = new PrismaClient();

if (process.env.NODE_ENV === 'production' && !process.argv.includes('--forcar')) {
  console.error('❌ Seed de demonstração bloqueado em produção: ele APAGA os dados da oficina.');
  console.error('   Se é mesmo isso que você quer, rode com --forcar.');
  process.exit(1);
}

const DIA = 24 * 60 * 60 * 1000;
const SENHA_DEMO = 'hermes123';

// ---- Aleatório com semente: o cenário sai igual toda vez ----------------------

let semente = 20260929;
const aleatorio = () => {
  semente = (semente * 16807) % 2147483647;
  return semente / 2147483647;
};
const escolher = <T>(lista: readonly T[]) => lista[Math.floor(aleatorio() * lista.length)];
function sortearPeso<T extends { peso: number }>(lista: readonly T[]): T {
  let r = aleatorio() * lista.reduce((s, x) => s + x.peso, 0);
  for (const x of lista) if ((r -= x.peso) < 0) return x;
  return lista[lista.length - 1];
}

/** CPF com dígito verificador certo (o cadastro valida). */
function cpf(): string {
  const n = Array.from({ length: 9 }, () => Math.floor(aleatorio() * 10));
  const dv = (base: number[]) => {
    const r = (base.reduce((s, d, i) => s + d * (base.length + 1 - i), 0) * 10) % 11;
    return r === 10 ? 0 : r;
  };
  n.push(dv(n));
  n.push(dv(n));
  return n.join('');
}

const LETRAS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
const placasUsadas = new Set<string>();
function placa(): string {
  for (;;) {
    const p = `${escolher([...LETRAS])}${escolher([...LETRAS])}${escolher([...LETRAS])}${Math.floor(aleatorio() * 10)}${escolher([...LETRAS])}${Math.floor(aleatorio() * 10)}${Math.floor(aleatorio() * 10)}`;
    if (!placasUsadas.has(p)) {
      placasUsadas.add(p);
      return p;
    }
  }
}

/** "AAAA-MM-DD" de N dias atrás (negativo = no futuro), no calendário local. */
function iso(diasAtras: number) {
  const d = new Date(Date.now() - diasAtras * DIA);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const diasAtras = (d: number) => new Date(Date.now() - d * DIA);

/** Empurra para o passado tudo o que um acontecimento gerou. */
async function retroceder(tabela: 'os' | 'compra' | 'venda' | 'despesa' | 'lancamento', id: string, dias: number) {
  if (dias <= 0) return;
  const d = dias;
  if (tabela === 'os') {
    await prisma.$executeRaw`UPDATE ordens_servico SET data_abertura = data_abertura - make_interval(days => ${d}::int),
      data_conclusao = data_conclusao - make_interval(days => ${d}::int), data_entrega = data_entrega - make_interval(days => ${d}::int),
      data_prevista = data_prevista - make_interval(days => ${d}::int) WHERE id = ${id}`;
    await prisma.$executeRaw`UPDATE lancamentos_caixa SET data = data - make_interval(days => ${d}::int) WHERE os_id = ${id}`;
    await prisma.$executeRaw`UPDATE movimentos_estoque SET data = data - make_interval(days => ${d}::int) WHERE os_id = ${id}`;
    await prisma.$executeRaw`UPDATE contas_receber SET vencimento = vencimento - make_interval(days => ${d}::int) WHERE os_id = ${id}`;
  }
  if (tabela === 'compra') {
    await prisma.$executeRaw`UPDATE compras SET data = data - make_interval(days => ${d}::int), pago_em = pago_em - make_interval(days => ${d}::int) WHERE id = ${id}`;
    await prisma.$executeRaw`UPDATE lancamentos_caixa SET data = data - make_interval(days => ${d}::int) WHERE compra_id = ${id}`;
    await prisma.$executeRaw`UPDATE movimentos_estoque SET data = data - make_interval(days => ${d}::int) WHERE compra_id = ${id}`;
  }
  if (tabela === 'venda') {
    await prisma.$executeRaw`UPDATE vendas SET data = data - make_interval(days => ${d}::int) WHERE id = ${id}`;
    await prisma.$executeRaw`UPDATE lancamentos_caixa SET data = data - make_interval(days => ${d}::int) WHERE venda_id = ${id}`;
    await prisma.$executeRaw`UPDATE movimentos_estoque SET data = data - make_interval(days => ${d}::int) WHERE venda_id = ${id}`;
  }
  if (tabela === 'despesa') {
    await prisma.$executeRaw`UPDATE lancamentos_caixa SET data = data - make_interval(days => ${d}::int) WHERE despesa_id = ${id}`;
    await prisma.$executeRaw`UPDATE despesas SET pago_em = pago_em - make_interval(days => ${d}::int) WHERE id = ${id}`;
  }
  if (tabela === 'lancamento') {
    await prisma.$executeRaw`UPDATE lancamentos_caixa SET data = data - make_interval(days => ${d}::int) WHERE id = ${id}`;
  }
}

async function usuario(nome: string, email: string, perfil: PerfilUsuario, comissaoPct?: number): Promise<UsuarioSessao> {
  const senhaHash = await bcrypt.hash(SENHA_DEMO, 10);
  const u = await prisma.usuario.upsert({
    where: { email },
    update: { nome, perfil, senhaHash, ativo: true, comissaoPct: comissaoPct ?? null },
    create: { nome, email, perfil, senhaHash, comissaoPct: comissaoPct ?? null },
  });
  // Cenário recriado: quem estava logado com o usuário de demonstração entra de novo.
  await prisma.sessao.deleteMany({ where: { usuarioId: u.id } });
  return { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, permissoes: PERMISSOES[u.perfil] };
}

// ---- Catálogo --------------------------------------------------------------

const SERVICOS = [
  ['oleo', 'Troca de óleo + filtro', 'Motor', 80, 30],
  ['alinha', 'Alinhamento e balanceamento', 'Suspensão', 120, 45],
  ['freio', 'Troca de pastilha de freio', 'Freios', 150, 60],
  ['revisao', 'Revisão completa 20 mil km', 'Revisão', 350, 120],
  ['correia', 'Troca de correia dentada', 'Motor', 400, 180],
  ['eletrico', 'Diagnóstico elétrico (scanner)', 'Elétrica', 90, 40],
  ['amort', 'Troca de amortecedores (par)', 'Suspensão', 220, 90],
  ['ar', 'Higienização do ar-condicionado', 'Conforto', 110, 40],
] as const;

/** [chave, nome, sku, código de barras, venda, custo, mínimo, alvo de estoque, unidade, fornecedor, prateleira] */
const PECAS = [
  ['oleo', 'Óleo 5W30 sintético', 'OL-5W30', '7891234000018', 38, 22, 20, 90, 'L', 'sul', 'A1'],
  ['filtroOleo', 'Filtro de óleo', 'FL-OLE', '7891234000025', 28, 14, 6, 25, 'un', 'sul', 'A2'],
  ['filtroAr', 'Filtro de ar', 'FL-AR', '7891234000032', 35, 18, 5, 12, 'un', 'sul', 'A2'],
  ['pastilha', 'Pastilha de freio dianteira', 'PF-DT', null, 110, 60, 4, 12, 'par', 'express', 'B1'],
  ['correia', 'Correia dentada (kit)', 'CD-KIT', null, 320, 180, 2, 4, 'kit', 'express', 'B3'],
  ['vela', 'Vela de ignição (jogo)', 'VL-IGN', '7891234000063', 78, 40, 4, 10, 'jogo', 'express', 'A3'],
  ['bateria', 'Bateria 60Ah', 'BT-60', null, 360, 210, 2, 4, 'un', 'sul', 'C1'],
  ['amort', 'Amortecedor dianteiro', 'AM-DT', null, 280, 150, 2, 6, 'un', 'express', 'C2'],
  ['fluido', 'Fluido de freio DOT4 500 ml', 'FF-DOT4', '7891234000094', 32, 16, 4, 14, 'un', 'sul', 'A4'],
  ['palheta', 'Palheta do limpador (par)', 'PL-PAR', '7891234000100', 45, 20, 4, 12, 'par', 'sul', 'A5'],
] as const;

/** O que a oficina mais faz, com o peso de cada tipo de serviço. */
const PACOTES: { peso: number; servicos: string[]; pecas: [string, number][]; dias?: number }[] = [
  { peso: 30, servicos: ['oleo'], pecas: [['oleo', 4], ['filtroOleo', 1]] },
  { peso: 8, servicos: ['oleo'], pecas: [['oleo', 3.5], ['filtroOleo', 1]] },
  { peso: 12, servicos: ['freio'], pecas: [['pastilha', 1], ['fluido', 1]] },
  { peso: 12, servicos: ['alinha'], pecas: [] },
  { peso: 8, servicos: ['revisao'], pecas: [['oleo', 4], ['filtroOleo', 1], ['filtroAr', 1], ['vela', 1]], dias: 2 },
  { peso: 4, servicos: ['correia'], pecas: [['correia', 1]], dias: 2 },
  { peso: 7, servicos: ['eletrico'], pecas: [] },
  { peso: 3, servicos: ['eletrico'], pecas: [['bateria', 1]] },
  { peso: 5, servicos: ['amort', 'alinha'], pecas: [['amort', 2]], dias: 2 },
  { peso: 6, servicos: ['ar'], pecas: [] },
  { peso: 5, servicos: ['oleo', 'alinha'], pecas: [['oleo', 4], ['filtroOleo', 1]] },
];

const FORMAS = [
  { peso: 45, forma: 'PIX' as const },
  { peso: 28, forma: 'CARTAO' as const },
  { peso: 15, forma: 'A_VISTA' as const },
  { peso: 8, forma: 'PARCELADO' as const },
  { peso: 4, forma: 'FIADO' as const },
];

const NOMES = ['Carlos', 'Fernanda', 'Roberto', 'Juliana', 'Marcos', 'Patrícia', 'Eduardo', 'Aline', 'Ricardo', 'Camila', 'Thiago', 'Beatriz', 'Rafael', 'Larissa', 'Bruno', 'Gabriela', 'Diego', 'Vanessa', 'Leandro', 'Renata', 'André', 'Tatiane', 'Felipe', 'Mariana', 'Gustavo', 'Priscila', 'Rodrigo', 'Letícia', 'Fábio', 'Carolina', 'Sérgio', 'Daniela'];
const SOBRENOMES = ['Andrade', 'Lima', 'Nunes', 'Costa', 'Oliveira', 'Souza', 'Ramos', 'Martins', 'Pereira', 'Almeida', 'Ferreira', 'Rodrigues', 'Gomes', 'Ribeiro', 'Carvalho', 'Barbosa', 'Rocha', 'Dias', 'Teixeira', 'Moreira'];
const CARROS = [['Honda', 'Civic'], ['Volkswagen', 'Gol'], ['Toyota', 'Corolla'], ['Hyundai', 'HB20'], ['Chevrolet', 'Onix'], ['Fiat', 'Argo'], ['Renault', 'Sandero'], ['Jeep', 'Renegade'], ['Fiat', 'Mobi'], ['Volkswagen', 'Polo'], ['Chevrolet', 'Tracker'], ['Fiat', 'Strada'], ['Toyota', 'Yaris'], ['Nissan', 'Kicks'], ['Ford', 'Ka'], ['Volkswagen', 'T-Cross']] as const;
const CORES = ['Preto', 'Branco', 'Prata', 'Cinza', 'Vermelho', 'Azul'];

async function main() {
  console.log('🌱 Montando o cenário de demonstração (6 meses de oficina)...');

  // ---- Limpeza (usuários reais ficam; os de demonstração são recriados) ----
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE
    "logs_auditoria","movimentos_estoque","contas_receber","despesas","lancamentos_caixa",
    "compra_itens","compras","venda_itens","vendas","visitas","os_pecas","os_servicos","ordens_servico",
    "orcamento_pecas","orcamento_servicos","orcamentos","carros","pecas","servicos",
    "fornecedores","clientes"
    RESTART IDENTITY CASCADE;`);

  const dono = await usuario('João', 'dono@hermes.local', 'DONO');
  const atendente = await usuario('Marina', 'atendente@hermes.local', 'ATENDENTE');
  const pedro = await usuario('Pedro', 'mecanico@hermes.local', 'MECANICO', 10);
  const lucas = await usuario('Lucas', 'lucas@hermes.local', 'MECANICO', 8);
  const mecanicos = [pedro, lucas];

  await prisma.oficina.upsert({ where: { id: 'unica' }, update: {}, create: { id: 'unica' } });
  await prisma.oficina.update({
    where: { id: 'unica' },
    data: {
      nome: 'Oficina Hermes',
      subtitulo: 'Mecânica geral · Freios · Suspensão · Elétrica',
      cnpj: '11222333000181',
      telefone: '1133334444',
      email: 'contato@oficinahermes.com.br',
      endereco: 'Rua das Oficinas, 500 — Vila Industrial, São Paulo/SP',
      observacoesDocumento:
        'Peças substituídas ficam à disposição do cliente por 7 dias. Valores podem mudar após a desmontagem, sempre com aprovação prévia.',
      margemPadrao: 80,
      descontoMaxSemSenha: 10,
      garantiaDias: 15,
      validadeOrcamentoDias: 15,
    },
  });

  // ---- Catálogo ----
  const fornecedores = {
    sul: await prisma.fornecedor.create({
      data: { nome: 'Distribuidora Auto Sul', cnpj: '11444777000161', contato: 'Sr. Almeida', telefone: '1140028922', prazoEntrega: 3 },
    }),
    express: await prisma.fornecedor.create({
      data: { nome: 'Peças Express', contato: 'Bianca', telefone: '1140031000', prazoEntrega: 1 },
    }),
  };

  const serv: Record<string, string> = {};
  for (const [chave, nome, categoria, preco, tempo] of SERVICOS) {
    serv[chave] = (await prisma.servico.create({ data: { nome, categoria, precoMaoDeObra: preco, tempoEstimadoMin: tempo } })).id;
  }

  // Peças nascem zeradas: o estoque entra pelas compras (kardex desde o começo).
  const peca: Record<string, { id: string; custo: number; alvo: number; fornecedor: 'sul' | 'express' }> = {};
  for (const [chave, nome, sku, codigo, venda, custo, minimo, alvo, unidade, forn, local] of PECAS) {
    const p = await prisma.peca.create({
      data: {
        nome,
        sku,
        codigoBarras: codigo,
        precoCusto: 0,
        precoVenda: venda,
        estoqueMinimo: minimo,
        unidade,
        localizacao: local,
        fornecedorId: fornecedores[forn].id,
        tipo: ['oleo', 'fluido', 'palheta'].includes(chave) ? 'PRODUTO' : 'PECA',
      },
    });
    peca[chave] = { id: p.id, custo, alvo, fornecedor: forn };
  }

  // ---- Clientes (os 2 primeiros são os "sumidos" da lista de retorno) ----
  const clientes: { id: string; carroId: string; nome: string }[] = [];
  for (let i = 0; i < 30; i++) {
    const nome = `${NOMES[i % NOMES.length]} ${SOBRENOMES[(i * 7) % SOBRENOMES.length]}`;
    const tel = `119${String(Math.floor(aleatorio() * 1e8)).padStart(8, '0')}`;
    const c = await prisma.cliente.create({
      data: { nome, tipo: 'PF', cpfCnpj: cpf(), telefone: tel, whatsapp: tel, email: i % 3 === 0 ? `${nome.split(' ')[0].toLowerCase()}@email.com` : null },
    });
    const [marca, modelo] = escolher(CARROS);
    const car = await prisma.carro.create({
      data: {
        clienteId: c.id,
        placa: placa(),
        marca,
        modelo,
        ano: 2012 + Math.floor(aleatorio() * 12),
        cor: escolher(CORES),
        combustivel: 'Flex',
        kmAtual: 15_000 + Math.floor(aleatorio() * 90_000),
      },
    });
    clientes.push({ id: c.id, carroId: car.id, nome });
  }
  const frota = await prisma.cliente.create({
    data: { nome: 'Auto Peças Silva Ltda', tipo: 'PJ', cpfCnpj: '11444777000161', telefone: '1133445566', email: 'frota@autopecassilva.com.br' },
  });
  const fiorino = await prisma.carro.create({
    data: { clienteId: frota.id, placa: placa(), marca: 'Fiat', modelo: 'Fiorino', ano: 2020, cor: 'Branco', kmAtual: 82_000, combustivel: 'Flex' },
  });
  const cliFrota = { id: frota.id, carroId: fiorino.id, nome: frota.nome };
  const RETORNO = [clientes[0], clientes[1]];
  const doDia = clientes.slice(2);

  // ---- Fila de acontecimentos, em ordem do tempo ----
  const fila: { dias: number; ordem: number; fazer: () => Promise<unknown> }[] = [];
  const agendar = (dias: number, ordem: number, fazer: () => Promise<unknown>) => fila.push({ dias, ordem, fazer });

  let nota = 10_300;
  async function comprarParaRepor(dias: number, forn: 'sul' | 'express', paga: boolean, vencimentoEm?: number) {
    const itens = [];
    for (const p of Object.values(peca)) {
      if (p.fornecedor !== forn) continue;
      const atual = Number((await prisma.peca.findUniqueOrThrow({ where: { id: p.id } })).estoqueAtual);
      const falta = p.alvo - atual;
      if (falta > 0) itens.push({ pecaId: p.id, quantidade: Math.ceil(falta), custoUnit: Math.round(p.custo * (0.95 + aleatorio() * 0.12) * 100) / 100 });
    }
    if (itens.length === 0) return;
    const c = await compras.criar(
      {
        fornecedorId: fornecedores[forn].id,
        pago: paga,
        formaPagamento: paga ? 'TRANSFERENCIA' : null,
        numeroNota: String(++nota),
        vencimento: !paga && vencimentoEm !== undefined ? iso(-vencimentoEm) : null,
        itens,
      },
      dono,
    );
    await retroceder('compra', c.id, dias);
  }

  /** Paga as parcelas que já venceram (o cliente costuma pagar), na data do vencimento. */
  async function quitarVencidas(osId: string) {
    const vencidas = await prisma.contaReceber.findMany({ where: { osId, status: 'PENDENTE', vencimento: { lt: new Date() } } });
    for (const p of vencidas) {
      await contas.receber(p.id, { formaPagamento: escolher(['PIX', 'A_VISTA'] as const) }, atendente);
      const lanc = await prisma.lancamentoCaixa.findFirstOrThrow({ where: { contaReceberId: p.id }, orderBy: { data: 'desc' } });
      await prisma.lancamentoCaixa.update({ where: { id: lanc.id }, data: { data: p.vencimento } });
      await prisma.contaReceber.update({ where: { id: p.id }, data: { pagoEm: p.vencimento } });
    }
  }

  async function osEntregue(
    dias: number,
    c: { id: string; carroId: string },
    pacote: (typeof PACOTES)[number],
    forma: (typeof FORMAS)[number]['forma'],
    opcoes: { quitar?: boolean } = {},
  ) {
    const mecanico = escolher(mecanicos);
    const os = await ordens.criar(
      {
        clienteId: c.id,
        carroId: c.carroId,
        mecanicoId: mecanico.id,
        desconto: 0,
        servicos: pacote.servicos.map((s) => ({ servicoId: serv[s], quantidade: 1 })),
        pecas: pacote.pecas.map(([p, q]) => ({ pecaId: peca[p].id, quantidade: q })),
        confirmarSemEstoque: true,
      },
      atendente,
    );
    await ordens.mudarStatus(os.id, 'EM_EXECUCAO', mecanico);
    await ordens.mudarStatus(os.id, 'CONCLUIDA', mecanico);
    if (forma === 'FIADO' || forma === 'PARCELADO') {
      await ordens.receber(
        os.id,
        { pagamentos: [], prazo: { forma, parcelas: forma === 'PARCELADO' ? 3 : 2, primeiroVencimento: iso(-30) }, liberarFiado: true },
        atendente,
      );
    } else {
      await ordens.receber(os.id, { pagamentos: [{ forma, valor: os.total }], liberarFiado: false }, atendente);
    }
    await retroceder('os', os.id, dias);
    if (pacote.dias) {
      await prisma.$executeRaw`UPDATE ordens_servico SET data_abertura = data_abertura - make_interval(days => ${pacote.dias}::int) WHERE id = ${os.id}`;
    }
    if (opcoes.quitar !== false) await quitarVencidas(os.id);
    return os;
  }

  // Retorno (RN-20): dois clientes atendidos há 7-8 meses que não voltaram.
  agendar(240, 0, () => osEntregue(240, RETORNO[0], PACOTES[3], 'PIX'));
  agendar(215, 0, () => osEntregue(215, RETORNO[1], PACOTES[6], 'CARTAO'));

  // Capital inicial e o primeiro abastecimento do estoque.
  agendar(182, 0, async () => {
    const l = await caixa.criar({ tipo: 'ENTRADA', origem: 'APORTE', descricao: 'Capital de giro inicial', valor: 8000, formaPagamento: 'TRANSFERENCIA' }, dono);
    await retroceder('lancamento', l.id, 182);
  });
  agendar(181, 0, () => comprarParaRepor(181, 'sul', true));
  agendar(181, 1, () => comprarParaRepor(181, 'express', true));

  // Reposição a cada duas semanas.
  for (let dias = 167; dias > 20; dias -= 14) {
    agendar(dias, 0, () => comprarParaRepor(dias, 'sul', true));
    agendar(dias, 1, () => comprarParaRepor(dias, 'express', true));
  }
  // Duas compras a prazo em aberto: uma já vencida, outra vencendo na semana.
  agendar(35, 0, () => comprarParaRepor(35, 'sul', false, -4));
  agendar(8, 0, () => comprarParaRepor(8, 'express', false, 5));

  // Despesas fixas e o pró-labore, todo mês.
  for (let mes = 5; mes >= 0; mes--) {
    const diaDaConta = mes * 30 + 25;
    for (const [categoria, descricao, valor] of [
      ['Aluguel', 'Aluguel do galpão', 2800],
      ['Energia', 'Conta de energia elétrica', 440 + mes * 23],
      ['Água', 'Conta de água', 120],
      ['Internet', 'Internet e telefone', 150],
      ['Contador', 'Honorários do contador', 450],
    ] as const) {
      agendar(diaDaConta, 5, async () => {
        const d = await despesas.criar(
          { categoria, descricao, valor, data: iso(diaDaConta), recorrente: true, pago: true, formaPagamento: 'TRANSFERENCIA' },
          dono,
        );
        await retroceder('despesa', d.id, diaDaConta);
      });
    }
    agendar(mes * 30 + 20, 6, async () => {
      const l = await caixa.criar({ tipo: 'SAIDA', origem: 'RETIRADA', descricao: 'Pró-labore do dono', valor: 3000, formaPagamento: 'PIX' }, dono);
      await retroceder('lancamento', l.id, mes * 30 + 20);
    });
  }

  // O dia a dia: de segunda a sábado, um ou dois carros por dia.
  let totalOS = 0;
  for (let dias = 180; dias >= 1; dias--) {
    if (diasAtras(dias).getDay() === 0) continue; // domingo fechado
    const qtd = aleatorio() < 0.2 ? 0 : aleatorio() < 0.75 ? 1 : 2;
    for (let k = 0; k < qtd; k++) {
      const c = escolher(doDia);
      const pacote = sortearPeso(PACOTES);
      const { forma } = sortearPeso(FORMAS);
      agendar(dias, 10 + k, () => osEntregue(dias, c, pacote, forma));
      totalOS++;
    }
    // Venda de balcão de vez em quando.
    if (aleatorio() < 0.25) {
      const item = escolher([['palheta', 1], ['fluido', 1], ['oleo', 1], ['vela', 1]] as const);
      agendar(dias, 20, async () => {
        const v = await vendas.criar(
          { itens: [{ pecaId: peca[item[0]].id, quantidade: item[1] }], desconto: 0, formaPagamento: escolher(['PIX', 'A_VISTA', 'CARTAO'] as const), confirmarSemEstoque: true },
          atendente,
        );
        await retroceder('venda', v.id, dias);
      });
    }
  }

  // Fiado em atraso: a frota da Auto Peças Silva pagou só uma parte.
  agendar(50, 30, async () => {
    const os = await osEntregue(50, cliFrota, PACOTES[4], 'FIADO', { quitar: false });
    const [primeira] = await prisma.contaReceber.findMany({ where: { osId: os.id }, orderBy: { parcela: 'asc' } });
    const parcial = await contas.receber(primeira.id, { formaPagamento: 'PIX', valor: 150 }, atendente);
    const lanc = await prisma.lancamentoCaixa.findFirstOrThrow({ where: { contaReceberId: parcial.id } });
    await retroceder('lancamento', lanc.id, 12);
  });
  // O caderno de fiado de antes do sistema, lançado na implantação.
  agendar(60, 30, () =>
    contas.lancarFiado({ clienteId: doDia[3].id, descricao: 'Fiado do caderno (antes do sistema)', valor: 240, parcelas: 2, primeiroVencimento: iso(-12) }),
  );

  // O freio que voltou em garantia (a OS de origem é de 9 dias atrás).
  let osDoFreio = '';
  agendar(9, 30, async () => {
    osDoFreio = (await osEntregue(9, doDia[5], PACOTES[2], 'PIX')).id;
  });

  // ---- Executa a fila, do mais antigo para o mais novo ----
  fila.sort((a, b) => b.dias - a.dias || a.ordem - b.ordem);
  let feitos = 0;
  for (const evento of fila) {
    await evento.fazer();
    if (++feitos % 40 === 0) process.stdout.write(`   ${feitos}/${fila.length}\r`);
  }
  console.log(`🛠️  ${totalOS + 4} OS entregues em 6 meses, compras quinzenais, despesas e pró-labore mensais`);

  // ---- Hoje, na oficina ----
  const { os: garantia } = await ordens.abrirGarantia(osDoFreio, { defeitoRelatado: 'Chiado ao frear — voltou em garantia' }, atendente);
  await ordens.mudarStatus(garantia.id, 'EM_EXECUCAO', atendente);

  const naOficina = async (c: { id: string; carroId: string }, servicos: string[], pecas: [string, number][], mecanicoId: string | null, previsao: number, queixa: string) =>
    ordens.criar(
      {
        clienteId: c.id,
        carroId: c.carroId,
        mecanicoId,
        kmEntrada: 40_000 + Math.floor(aleatorio() * 50_000),
        defeitoRelatado: queixa,
        dataPrevista: new Date(Date.now() + previsao * DIA).toISOString(),
        desconto: 0,
        servicos: servicos.map((s) => ({ servicoId: serv[s], quantidade: 1 })),
        pecas: pecas.map(([p, q]) => ({ pecaId: peca[p].id, quantidade: q })),
        confirmarSemEstoque: true,
      },
      atendente,
    );

  const revisao = await naOficina(doDia[0], ['revisao'], [['oleo', 4], ['filtroOleo', 1], ['filtroAr', 1]], pedro.id, 1, 'Revisão dos 60 mil km');
  await ordens.mudarStatus(revisao.id, 'EM_EXECUCAO', pedro);
  await ordens.alterarServico(revisao.id, revisao.servicos[0].id, { concluido: true }, pedro);

  const suspensao = await naOficina(doDia[1], ['amort', 'alinha'], [['amort', 2]], lucas.id, -1, 'Batida seca na suspensão dianteira');
  await ordens.mudarStatus(suspensao.id, 'EM_EXECUCAO', lucas);

  const correia = await naOficina(doDia[2], ['correia'], [], pedro.id, 3, 'Barulho no motor, correia com mais de 60 mil km');
  await ordens.adicionarPeca(correia.id, { pecaId: peca.correia.id, quantidade: 1, confirmarSemEstoque: true }, pedro);
  await ordens.mudarStatus(correia.id, 'AGUARDANDO_PECA', pedro);

  const pronta = await naOficina(doDia[3], ['oleo', 'ar'], [['oleo', 4], ['filtroOleo', 1]], lucas.id, 0, 'Troca de óleo e cheiro no ar-condicionado');
  await ordens.mudarStatus(pronta.id, 'EM_EXECUCAO', lucas);
  await ordens.mudarStatus(pronta.id, 'CONCLUIDA', lucas);

  await naOficina(doDia[4], ['eletrico'], [], null, 2, 'Luz da injeção acesa no painel');

  // ---- Orçamentos em aberto ----
  const orcar = (c: { id: string; carroId: string }, servicos: string[], pecas: [string, number][]) =>
    orcamentos.criar(
      {
        clienteId: c.id,
        carroId: c.carroId,
        desconto: 0,
        servicos: servicos.map((s) => ({ servicoId: serv[s], quantidade: 1 })),
        pecas: pecas.map(([p, q]) => ({ pecaId: peca[p].id, quantidade: q })),
        observacoes: 'Cliente vai confirmar por WhatsApp',
      },
      atendente,
    );
  const enviado = await orcar(doDia[6], ['correia', 'oleo'], [['correia', 1], ['oleo', 4], ['filtroOleo', 1]]);
  await orcamentos.alterarStatus(enviado.id, 'ENVIADO');
  await prisma.orcamento.update({ where: { id: enviado.id }, data: { validade: new Date(Date.now() + 2 * DIA) } });
  await orcar(doDia[7], ['alinha', 'eletrico'], []);
  const expirado = await orcar(doDia[8], ['amort'], [['amort', 2]]);
  await prisma.orcamento.update({ where: { id: expirado.id }, data: { data: diasAtras(25), validade: diasAtras(10) } });
  await orcamentos.criar(
    {
      contatoNome: 'Seu Antônio',
      contatoTelefone: '11912345678',
      veiculoDescricao: 'Uno 2010',
      desconto: 0,
      servicos: [{ servicoId: serv.freio, quantidade: 1 }],
      pecas: [{ pecaId: peca.pastilha.id, quantidade: 1 }],
    },
    atendente,
  );

  // ---- Contas do mês ainda por pagar ----
  await despesas.criar({ categoria: 'Aluguel', descricao: 'Aluguel do galpão', valor: 2800, data: iso(-5), recorrente: true, pago: false }, dono);
  await despesas.criar({ categoria: 'Ferramentas', descricao: 'Conserto da chave de impacto', valor: 180, data: iso(3), recorrente: false, pago: false }, dono);

  // ---- Agenda dos próximos dias ----
  const emDias = (d: number, h: number, m = 0) => {
    const x = new Date();
    x.setDate(x.getDate() + d);
    x.setHours(h, m, 0, 0);
    return x;
  };
  await prisma.visita.createMany({
    data: [
      { clienteId: doDia[10].id, carroId: doDia[10].carroId, dataHora: emDias(1, 9), tipo: 'REVISAO', status: 'CONFIRMADA', observacoes: 'Revisão dos 50.000 km' },
      { clienteId: doDia[11].id, carroId: doDia[11].carroId, dataHora: emDias(1, 14, 30), tipo: 'ORCAMENTO', status: 'AGENDADA' },
      { clienteId: doDia[12].id, carroId: doDia[12].carroId, dataHora: emDias(3, 11), tipo: 'RETORNO', status: 'AGENDADA', observacoes: 'Conferir barulho na suspensão' },
      { clienteId: doDia[5].id, carroId: doDia[5].carroId, dataHora: emDias(5, 16), tipo: 'GARANTIA', status: 'AGENDADA' },
    ],
  });

  // Inventário do dia: dois filtros de ar com defeito voltaram ao fornecedor.
  const filtroAr = Number((await prisma.peca.findUniqueOrThrow({ where: { id: peca.filtroAr.id } })).estoqueAtual);
  await prisma.$transaction((tx) =>
    ajustar(tx, peca.filtroAr.id, Math.max(0, Math.min(filtroAr, 5) - 2), { motivo: 'Inventário: 2 com defeito devolvidos ao fornecedor', usuarioId: dono.id }),
  );

  // O log de auditoria começa limpo: a demonstração não foi "feita" por ninguém.
  await prisma.logAuditoria.deleteMany();

  const [os, lanc, mov] = await Promise.all([prisma.ordemServico.count(), prisma.lancamentoCaixa.count(), prisma.movimentoEstoque.count()]);
  console.log(`✅ Pronto: ${os} OS, ${lanc} lançamentos de caixa, ${mov} movimentos de estoque.`);
  console.log(`   Entre com dono@hermes.local, atendente@hermes.local ou mecanico@hermes.local (senha ${SENHA_DEMO}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
