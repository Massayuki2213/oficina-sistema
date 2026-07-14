import { PrismaClient, PerfilUsuario } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Popula o banco com um cenário de demonstração completo e CONSISTENTE.
// Limpa os dados de domínio (mantém os usuários) e recria tudo do zero,
// então pode rodar quantas vezes quiser. Rode com: npm run db:seed
const prisma = new PrismaClient();

const round2 = (n: number) => Math.round(n * 100) / 100;
const dia = 24 * 60 * 60 * 1000;
const diasAtras = (n: number) => new Date(Date.now() - n * dia);
const diasFrente = (n: number) => new Date(Date.now() + n * dia);
// data/hora "amanhã às HH:MM" (local) para os agendamentos
function emDias(n: number, hora: number, min = 0) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hora, min, 0, 0);
  return d;
}
// 1º dia do mês corrente (08:00). O histórico financeiro é ancorado a partir daqui
// para aparecer na visão padrão "Este mês", mesmo logo no começo do mês.
function inicioMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1, 8, 0, 0, 0);
}
// "n dias atrás", mas nunca antes do início do mês (para não sumir do filtro do mês).
function noMes(n: number) {
  const alvo = diasAtras(n);
  const ini = inicioMes();
  return alvo < ini ? ini : alvo;
}

async function main() {
  console.log('🌱 Populando o banco (cenário de demonstração)...');

  // ---- Usuários / perfis (mantidos por upsert: não invalida a sessão atual) ----
  const senhaHash = await bcrypt.hash('hermes123', 10);
  const usuarios: { nome: string; email: string; perfil: PerfilUsuario }[] = [
    { nome: 'João', email: 'dono@hermes.local', perfil: 'DONO' },
    { nome: 'Marina', email: 'atendente@hermes.local', perfil: 'ATENDENTE' },
    { nome: 'Pedro', email: 'mecanico@hermes.local', perfil: 'MECANICO' },
  ];
  for (const u of usuarios) {
    await prisma.usuario.upsert({
      where: { email: u.email },
      update: { nome: u.nome, perfil: u.perfil, senhaHash, ativo: true },
      create: { ...u, senhaHash },
    });
  }
  const dono = await prisma.usuario.findUniqueOrThrow({ where: { email: 'dono@hermes.local' } });
  const mecanico = await prisma.usuario.findUniqueOrThrow({ where: { email: 'mecanico@hermes.local' } });
  console.log(`👤 ${usuarios.length} usuários prontos (senha padrão: hermes123)`);

  // ---- Limpeza dos dados de domínio (reinicia a numeração de orçamentos/OS) ----
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE
    "logs_auditoria","movimentos_estoque","contas_receber","despesas","lancamentos_caixa",
    "compra_itens","compras","visitas","os_pecas","os_servicos","ordens_servico",
    "orcamento_pecas","orcamento_servicos","orcamentos","carros","pecas","servicos",
    "fornecedores","clientes"
    RESTART IDENTITY CASCADE;`);
  console.log('🧹 dados antigos removidos');

  // ---- Fornecedores ----
  const fornSul = await prisma.fornecedor.create({
    data: { nome: 'Distribuidora Auto Sul', cnpj: '12.345.678/0001-90', contato: 'Sr. Almeida', telefone: '(11) 4002-8922', prazoEntrega: 3 },
  });
  const fornExpress = await prisma.fornecedor.create({
    data: { nome: 'Peças Express', contato: 'Bianca', telefone: '(11) 4003-1000', prazoEntrega: 1 },
  });

  // ---- Catálogo de serviços ----
  const servDefs = [
    { key: 'oleo', nome: 'Troca de óleo + filtro', categoria: 'Motor', preco: 80, tempo: 30 },
    { key: 'alinha', nome: 'Alinhamento e balanceamento', categoria: 'Suspensão', preco: 120, tempo: 45 },
    { key: 'freio', nome: 'Troca de pastilha de freio', categoria: 'Freios', preco: 150, tempo: 60 },
    { key: 'revisao', nome: 'Revisão completa 20mil km', categoria: 'Revisão', preco: 350, tempo: 120 },
    { key: 'correia', nome: 'Troca de correia dentada', categoria: 'Motor', preco: 400, tempo: 180 },
    { key: 'eletrico', nome: 'Diagnóstico elétrico (scanner)', categoria: 'Elétrica', preco: 90, tempo: 40 },
  ] as const;
  const serv: Record<string, { id: string; precoMaoDeObra: number }> = {};
  for (const s of servDefs) {
    const created = await prisma.servico.create({
      data: { nome: s.nome, categoria: s.categoria, precoMaoDeObra: s.preco, tempoEstimadoMin: s.tempo },
    });
    serv[s.key] = { id: created.id, precoMaoDeObra: s.preco };
  }
  console.log(`🔧 ${servDefs.length} serviços no catálogo`);

  // ---- Catálogo de peças / estoque (2 abaixo do mínimo p/ o alerta do painel) ----
  const pecaDefs = [
    { key: 'oleo', nome: 'Óleo 5W30 Sintético', sku: 'OL-5W30', cod: '7891234000018', custo: 22, venda: 38, estoque: 34, min: 10, un: 'L', forn: fornSul.id },
    { key: 'filtroOleo', nome: 'Filtro de óleo', sku: 'FL-OLE', cod: '7891234000025', custo: 14, venda: 28, estoque: 3, min: 5, un: 'un', forn: fornSul.id },
    { key: 'pastilha', nome: 'Pastilha de freio dianteira', sku: 'PF-DT', cod: null, custo: 60, venda: 110, estoque: 8, min: 4, un: 'par', forn: fornExpress.id },
    { key: 'filtroAr', nome: 'Filtro de ar', sku: 'FL-AR', cod: null, custo: 18, venda: 35, estoque: 12, min: 5, un: 'un', forn: fornSul.id },
    { key: 'correia', nome: 'Correia dentada (kit)', sku: 'CD-KIT', cod: null, custo: 180, venda: 320, estoque: 4, min: 2, un: 'kit', forn: fornExpress.id },
    { key: 'vela', nome: 'Vela de ignição (jogo)', sku: 'VL-IGN', cod: '7891234000063', custo: 40, venda: 78, estoque: 2, min: 6, un: 'jogo', forn: fornExpress.id },
    { key: 'bateria', nome: 'Bateria 60Ah', sku: 'BT-60', cod: null, custo: 210, venda: 360, estoque: 5, min: 2, un: 'un', forn: fornSul.id },
  ] as const;
  const peca: Record<string, { id: string; precoVenda: number }> = {};
  for (const p of pecaDefs) {
    const created = await prisma.peca.create({
      data: {
        nome: p.nome, sku: p.sku, codigoBarras: p.cod, precoCusto: p.custo, precoVenda: p.venda,
        margemPct: round2(((p.venda - p.custo) / p.custo) * 100),
        estoqueAtual: p.estoque, estoqueMinimo: p.min, unidade: p.un, fornecedorId: p.forn,
      },
    });
    peca[p.key] = { id: created.id, precoVenda: p.venda };
  }
  console.log(`📦 ${pecaDefs.length} peças no estoque`);

  // ---- Clientes ----
  const cliCarlos = await prisma.cliente.create({ data: { nome: 'Carlos Andrade', tipo: 'PF', telefone: '(11) 98877-1234', whatsapp: '(11) 98877-1234', email: 'carlos.andrade@email.com' } });
  const cliFernanda = await prisma.cliente.create({ data: { nome: 'Fernanda Lima', tipo: 'PF', telefone: '(11) 99123-4567', whatsapp: '(11) 99123-4567' } });
  const cliSilva = await prisma.cliente.create({ data: { nome: 'Auto Peças Silva Ltda', tipo: 'PJ', cpfCnpj: '23.456.789/0001-10', telefone: '(11) 3344-5566', email: 'contato@autopecassilva.com' } });
  const cliRoberto = await prisma.cliente.create({ data: { nome: 'Roberto Nunes', tipo: 'PF', telefone: '(11) 98765-4321' } });
  const cliJuliana = await prisma.cliente.create({ data: { nome: 'Juliana Costa', tipo: 'PF', telefone: '(11) 97654-3210', whatsapp: '(11) 97654-3210' } });
  console.log('🧑 5 clientes');

  // ---- Carros ----
  const carCivic = await prisma.carro.create({ data: { clienteId: cliCarlos.id, placa: 'RIO2A18', marca: 'Honda', modelo: 'Civic', ano: 2019, cor: 'Preto', kmAtual: 45000, combustivel: 'Flex' } });
  const carGol = await prisma.carro.create({ data: { clienteId: cliFernanda.id, placa: 'SAO4B27', marca: 'Volkswagen', modelo: 'Gol', ano: 2017, cor: 'Branco', kmAtual: 78000, combustivel: 'Flex' } });
  const carFiorino = await prisma.carro.create({ data: { clienteId: cliSilva.id, placa: 'BRA5C33', marca: 'Fiat', modelo: 'Fiorino', ano: 2020, cor: 'Branco', kmAtual: 32000, combustivel: 'Flex' } });
  const carCorolla = await prisma.carro.create({ data: { clienteId: cliRoberto.id, placa: 'CAM7D41', marca: 'Toyota', modelo: 'Corolla', ano: 2021, cor: 'Prata', kmAtual: 21000, combustivel: 'Flex' } });
  const carHB20 = await prisma.carro.create({ data: { clienteId: cliJuliana.id, placa: 'MIN3E55', marca: 'Hyundai', modelo: 'HB20', ano: 2018, cor: 'Vermelho', kmAtual: 55000, combustivel: 'Flex' } });
  console.log('🚗 5 veículos');

  // Helpers para montar itens congelando o preço do catálogo.
  const itS = (key: string, q = 1) => ({ servicoId: serv[key].id, quantidade: q, precoUnit: serv[key].precoMaoDeObra });
  const itP = (key: string, q = 1) => ({ pecaId: peca[key].id, quantidade: q, precoUnit: peca[key].precoVenda });
  const somaItens = (itens: { quantidade: number; precoUnit: number }[]) => round2(itens.reduce((s, i) => s + i.quantidade * i.precoUnit, 0));

  // ---- Orçamentos (vários status) ----
  // A) Enviado ao cliente, aguardando resposta
  const orcAserv = [itS('oleo')];
  const orcApec = [itP('oleo', 4), itP('filtroOleo')];
  const orcAtotal = somaItens([...orcAserv, ...orcApec]);
  await prisma.orcamento.create({
    data: {
      clienteId: cliCarlos.id, carroId: carCivic.id, status: 'ENVIADO', validade: diasFrente(15),
      subtotal: orcAtotal, desconto: 0, total: orcAtotal, observacoes: 'Cliente vai confirmar por WhatsApp',
      servicos: { create: orcAserv }, pecas: { create: orcApec },
    },
  });
  // B) Rascunho ainda sendo montado
  const orcBserv = [itS('alinha'), itS('eletrico')];
  const orcBtotal = somaItens(orcBserv);
  await prisma.orcamento.create({
    data: {
      clienteId: cliJuliana.id, carroId: carHB20.id, status: 'RASCUNHO', validade: diasFrente(15),
      subtotal: orcBtotal, desconto: 0, total: orcBtotal,
      servicos: { create: orcBserv },
    },
  });
  // C) Aprovado -> vira a OS em execução (abaixo)
  const orcCserv = [itS('revisao')];
  const orcCpec = [itP('filtroAr'), itP('oleo', 4)];
  const orcCtotal = somaItens([...orcCserv, ...orcCpec]);
  const orcC = await prisma.orcamento.create({
    data: {
      clienteId: cliRoberto.id, carroId: carCorolla.id, status: 'APROVADO', validade: diasFrente(10),
      subtotal: orcCtotal, desconto: 0, total: orcCtotal,
      servicos: { create: orcCserv }, pecas: { create: orcCpec },
    },
  });
  console.log('📄 3 orçamentos (enviado, rascunho, aprovado)');

  // ---- Ordens de Serviço ----
  // Histórico pago (entram no caixa) — criadas primeiro p/ ficarem com os números menores
  async function osPaga(opts: {
    clienteId: string; carroId: string; itens: any[]; forma: 'A_VISTA' | 'PIX' | 'CARTAO'; concluidaHa: number;
  }) {
    const servicos = opts.itens.filter((i) => 'servicoId' in i);
    const pecas = opts.itens.filter((i) => 'pecaId' in i);
    const total = somaItens(opts.itens);
    const os = await prisma.ordemServico.create({
      data: {
        clienteId: opts.clienteId, carroId: opts.carroId, mecanicoId: mecanico.id, status: 'ENTREGUE',
        total, pago: true, formaPagamento: opts.forma, dataAbertura: noMes(opts.concluidaHa + 1),
        dataConclusao: noMes(opts.concluidaHa),
        servicos: { create: servicos }, pecas: { create: pecas },
      },
      include: { cliente: true },
    });
    await prisma.lancamentoCaixa.create({
      data: {
        tipo: 'ENTRADA', origem: 'OS', descricao: `OS #${os.numero} — ${os.cliente.nome}`,
        valor: total, formaPagamento: opts.forma, categoria: 'Ordem de Serviço', osId: os.id,
        usuarioId: dono.id, data: noMes(opts.concluidaHa),
      },
    });
    return os;
  }
  await osPaga({ clienteId: cliRoberto.id, carroId: carCorolla.id, itens: [itS('revisao'), itS('eletrico')], forma: 'A_VISTA', concluidaHa: 2 });
  await osPaga({ clienteId: cliJuliana.id, carroId: carHB20.id, itens: [itS('correia'), itP('correia')], forma: 'CARTAO', concluidaHa: 1 });
  await osPaga({ clienteId: cliCarlos.id, carroId: carCivic.id, itens: [itS('oleo'), itP('oleo', 4), itP('filtroOleo')], forma: 'PIX', concluidaHa: 0 });

  // Fiado (parcelado): não entra no caixa agora; gera parcelas em Contas a Receber
  const osFiadoItens = [itS('revisao'), itP('filtroAr'), itP('oleo', 2)];
  const osFiadoTotal = somaItens(osFiadoItens);
  const osFiado = await prisma.ordemServico.create({
    data: {
      clienteId: cliSilva.id, carroId: carFiorino.id, mecanicoId: mecanico.id, status: 'ENTREGUE',
      total: osFiadoTotal, pago: false, formaPagamento: 'PARCELADO', dataAbertura: noMes(3), dataConclusao: noMes(2),
      servicos: { create: osFiadoItens.filter((i) => 'servicoId' in i) }, pecas: { create: osFiadoItens.filter((i) => 'pecaId' in i) },
    },
  });
  const base = Math.floor((osFiadoTotal / 2) * 100) / 100;
  await prisma.contaReceber.createMany({
    data: [
      { clienteId: cliSilva.id, osId: osFiado.id, parcela: 1, totalParcelas: 2, vencimento: diasAtras(5), valor: base, status: 'PENDENTE' }, // vencida -> em atraso
      { clienteId: cliSilva.id, osId: osFiado.id, parcela: 2, totalParcelas: 2, vencimento: diasFrente(25), valor: round2(osFiadoTotal - base), status: 'PENDENTE' },
    ],
  });

  // Em andamento / aguardando pagamento (aparecem no painel)
  await prisma.ordemServico.create({
    data: {
      orcamentoId: orcC.id, clienteId: cliRoberto.id, carroId: carCorolla.id, mecanicoId: mecanico.id,
      status: 'EM_EXECUCAO', total: orcCtotal, pago: false, dataAbertura: noMes(1),
      servicos: { create: orcCserv }, pecas: { create: orcCpec },
    },
  });
  const os2Itens = [itS('freio'), itP('pastilha')];
  await prisma.ordemServico.create({
    data: {
      clienteId: cliFernanda.id, carroId: carGol.id, mecanicoId: mecanico.id, status: 'CONCLUIDA',
      total: somaItens(os2Itens), pago: false, dataAbertura: noMes(1), dataConclusao: new Date(),
      servicos: { create: [itS('freio')] }, pecas: { create: [itP('pastilha')] },
    },
  });
  console.log('🛠️  6 ordens de serviço (3 pagas, 1 fiado, 1 em execução, 1 concluída)');

  // ---- Caixa: aporte inicial + despesas pagas (as entradas de OS já foram lançadas acima) ----
  await prisma.lancamentoCaixa.create({
    data: { tipo: 'ENTRADA', origem: 'APORTE', descricao: 'Aporte inicial do caixa', valor: 1000, categoria: 'Aporte', usuarioId: dono.id, data: inicioMes() },
  });

  async function despesaPaga(categoria: string, descricao: string, valor: number, quandoHa: number, recorrente = false) {
    await prisma.despesa.create({ data: { categoria, descricao, valor, recorrente, pago: true, data: noMes(quandoHa) } });
    await prisma.lancamentoCaixa.create({
      data: { tipo: 'SAIDA', origem: 'DESPESA', descricao, valor, categoria, usuarioId: dono.id, data: noMes(quandoHa) },
    });
  }
  await despesaPaga('Aluguel', 'Aluguel do galpão', 1200, 2, true);
  await despesaPaga('Energia', 'Conta de energia elétrica', 380, 1);
  console.log('💰 caixa: aporte + entradas de OS + despesas (2 pagas)');

  // ---- Compras de distribuidores (contas a pagar) ----
  // Registros históricos: o estoque acima já reflete o saldo atual, então aqui
  // só criamos a compra e seus itens (sem reaplicar entrada de estoque).
  async function compra(fornId: string, itens: { pecaId: string; quantidade: number; custoUnit: number }[], opts: { pago: boolean; quandoHa: number; nota?: string; descForCaixa: string }) {
    const valorTotal = round2(itens.reduce((s, i) => s + i.custoUnit * i.quantidade, 0));
    const c = await prisma.compra.create({
      data: {
        fornecedorId: fornId,
        valorTotal,
        numeroNota: opts.nota ?? null,
        status: opts.pago ? 'PAGA' : 'PENDENTE',
        pagoEm: opts.pago ? noMes(opts.quandoHa) : null,
        data: noMes(opts.quandoHa),
        itens: { create: itens },
      },
    });
    if (opts.pago) {
      await prisma.lancamentoCaixa.create({
        data: { tipo: 'SAIDA', origem: 'DESPESA', descricao: opts.descForCaixa, valor: valorTotal, categoria: 'Compra de peças', usuarioId: dono.id, data: noMes(opts.quandoHa) },
      });
    }
    return c;
  }
  // Duas em aberto (aparecem em "a pagar" por distribuidor) e uma já acertada.
  await compra(fornSul.id, [
    { pecaId: peca.oleo.id, quantidade: 20, custoUnit: 22 },
    { pecaId: peca.filtroOleo.id, quantidade: 10, custoUnit: 14 },
  ], { pago: false, quandoHa: 5, nota: '10457', descForCaixa: '' });
  await compra(fornExpress.id, [
    { pecaId: peca.pastilha.id, quantidade: 4, custoUnit: 60 },
  ], { pago: false, quandoHa: 2, descForCaixa: '' });
  await compra(fornSul.id, [
    { pecaId: peca.filtroAr.id, quantidade: 10, custoUnit: 18 },
  ], { pago: true, quandoHa: 8, nota: '10388', descForCaixa: 'Compra — Distribuidora Auto Sul' });
  console.log('🚚 3 compras (2 a pagar: Auto Sul + Express, 1 acertada)');

  // ---- Agenda (próximos dias) ----
  await prisma.visita.createMany({
    data: [
      { clienteId: cliCarlos.id, carroId: carCivic.id, dataHora: emDias(1, 9, 0), tipo: 'REVISAO', status: 'CONFIRMADA', observacoes: 'Revisão dos 45.000 km' },
      { clienteId: cliFernanda.id, carroId: carGol.id, dataHora: emDias(1, 14, 30), tipo: 'ORCAMENTO', status: 'AGENDADA' },
      { clienteId: cliRoberto.id, carroId: carCorolla.id, dataHora: emDias(3, 11, 0), tipo: 'RETORNO', status: 'AGENDADA', observacoes: 'Conferir barulho na suspensão' },
      { clienteId: cliJuliana.id, carroId: carHB20.id, dataHora: emDias(5, 16, 0), tipo: 'GARANTIA', status: 'AGENDADA' },
    ],
  });
  console.log('📅 4 agendamentos');

  console.log('✅ Seed concluído — cenário de demonstração pronto.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
