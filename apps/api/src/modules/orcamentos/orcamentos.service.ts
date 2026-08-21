import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { AppError } from '../../lib/errors.js';
import type { CreateOrcamentoInput, StatusOrcamentoInput } from './orcamentos.schema.js';

const CACHE_KEY = 'orcamentos:list';
const CACHE_TTL = 30;
async function invalidarCache() {
  await redis.del(CACHE_KEY);
}

// Inclui tudo que uma tela de orçamento precisa.
const fullInclude = {
  cliente: true,
  carro: true,
  servicos: { include: { servico: true } },
  pecas: { include: { peca: true } },
} as const;

const num = (v: unknown) => Number(v);

// Converte os Decimals para number (contrato do @hermes/shared).
function toDTO(o: any) {
  return {
    ...o,
    subtotal: num(o.subtotal),
    desconto: num(o.desconto),
    total: num(o.total),
    servicos: o.servicos?.map((s: any) => ({
      ...s,
      precoUnit: num(s.precoUnit),
      servico: s.servico ? { ...s.servico, precoMaoDeObra: num(s.servico.precoMaoDeObra) } : undefined,
    })),
    pecas: o.pecas?.map((p: any) => ({
      ...p,
      precoUnit: num(p.precoUnit),
      peca: p.peca ? { ...p.peca, precoCusto: num(p.peca.precoCusto), precoVenda: num(p.peca.precoVenda) } : undefined,
    })),
  };
}

function osToDTO(o: any) {
  return {
    ...o,
    total: num(o.total),
    servicos: o.servicos?.map((s: any) => ({ ...s, precoUnit: num(s.precoUnit) })),
    pecas: o.pecas?.map((p: any) => ({ ...p, precoUnit: num(p.precoUnit) })),
  };
}

/**
 * RN-06: o orçamento vence sozinho depois da validade.
 *
 * A expiração é aplicada na LEITURA, não por um job de fundo. Job só roda com a
 * API ligada — erraria justamente o dia em que a oficina ficou fechada, que é
 * quando os orçamentos vencem. Assim, quem abre a tela sempre vê o status certo.
 *
 * Só RASCUNHO e ENVIADO expiram: APROVADO já virou OS e RECUSADO já morreu.
 */
export async function expirarVencidos() {
  const { count } = await prisma.orcamento.updateMany({
    where: { status: { in: ['RASCUNHO', 'ENVIADO'] }, validade: { lt: new Date() } },
    data: { status: 'EXPIRADO' },
  });
  if (count > 0) await invalidarCache();
  return count;
}

export async function listOrcamentos(busca?: string) {
  await expirarVencidos();
  const orcamentos = await prisma.orcamento.findMany({
    orderBy: { data: 'desc' },
    include: {
      cliente: { select: { id: true, nome: true } },
      carro: { select: { id: true, placa: true, modelo: true } },
    },
    where: busca
      ? {
          OR: [
            { cliente: { nome: { contains: busca, mode: 'insensitive' } } },
            { carro: { placa: { contains: busca.toUpperCase().replace(/[^A-Z0-9]/g, '') } } },
          ],
        }
      : {},
  });
  return orcamentos.map((o) => ({ ...o, subtotal: num(o.subtotal), desconto: num(o.desconto), total: num(o.total) }));
}

export async function getOrcamento(id: string) {
  await expirarVencidos();
  const orc = await prisma.orcamento.findUnique({ where: { id }, include: fullInclude });
  return orc ? toDTO(orc) : null;
}

/**
 * Valida o veículo, "congela" os preços do catálogo nos itens e fecha as contas
 * (RN-09: total = mão de obra + peças − desconto). Serve para criar e para editar.
 */
async function montarOrcamento(data: CreateOrcamentoInput) {
  // O veículo precisa existir e pertencer ao cliente informado.
  const carro = await prisma.carro.findUnique({ where: { id: data.carroId } });
  if (!carro) throw new AppError(400, 'Veículo não encontrado');
  if (carro.clienteId !== data.clienteId) throw new AppError(400, 'O veículo não pertence a esse cliente');

  // Busca os itens do catálogo para "congelar" o preço no orçamento.
  const [servicos, pecas] = await Promise.all([
    prisma.servico.findMany({ where: { id: { in: data.servicos.map((s) => s.servicoId) } } }),
    prisma.peca.findMany({ where: { id: { in: data.pecas.map((p) => p.pecaId) } } }),
  ]);
  const servMap = new Map(servicos.map((s) => [s.id, s]));
  const pecaMap = new Map(pecas.map((p) => [p.id, p]));

  let subtotal = 0;
  const servicosCreate = data.servicos.map((s) => {
    const cat = servMap.get(s.servicoId);
    if (!cat) throw new AppError(400, 'Serviço inválido no orçamento');
    const precoUnit = Number(cat.precoMaoDeObra);
    subtotal += precoUnit * s.quantidade;
    return { servicoId: s.servicoId, quantidade: s.quantidade, precoUnit };
  });
  const pecasCreate = data.pecas.map((p) => {
    const cat = pecaMap.get(p.pecaId);
    if (!cat) throw new AppError(400, 'Peça inválida no orçamento');
    const precoUnit = Number(cat.precoVenda);
    subtotal += precoUnit * p.quantidade;
    return { pecaId: p.pecaId, quantidade: p.quantidade, precoUnit };
  });

  const desconto = Math.min(data.desconto, subtotal);
  return {
    clienteId: data.clienteId,
    carroId: data.carroId,
    validade: new Date(Date.now() + data.validadeDias * 24 * 60 * 60 * 1000),
    subtotal,
    desconto,
    total: subtotal - desconto,
    observacoes: data.observacoes,
    servicosCreate,
    pecasCreate,
  };
}

export async function createOrcamento(data: CreateOrcamentoInput) {
  const { servicosCreate, pecasCreate, ...campos } = await montarOrcamento(data);

  const orcamento = await prisma.orcamento.create({
    data: { ...campos, servicos: { create: servicosCreate }, pecas: { create: pecasCreate } },
    include: fullInclude,
  });

  await invalidarCache();
  return toDTO(orcamento);
}

/**
 * Edita um orçamento que ainda não virou OS (Fase 5 — corrigir sem refazer).
 * Aprovado é intocável: já gerou Ordem de Serviço e baixou estoque.
 */
export async function updateOrcamento(id: string, data: CreateOrcamentoInput) {
  const atual = await prisma.orcamento.findUnique({ where: { id }, include: { ordem: true } });
  if (!atual) throw new AppError(404, 'Orçamento não encontrado');
  if (atual.ordem) throw new AppError(409, 'Este orçamento já virou uma Ordem de Serviço e não pode ser alterado');
  if (atual.status === 'APROVADO') throw new AppError(409, 'Orçamento aprovado não pode ser alterado');

  const { servicosCreate, pecasCreate, ...campos } = await montarOrcamento(data);

  // RN-06: editar renova a validade, então o orçamento sai do limbo de EXPIRADO
  // e volta a valer como rascunho. Sem isso ele ficaria com data nova e status velho.
  const status = atual.status === 'EXPIRADO' ? ('RASCUNHO' as const) : atual.status;

  // Troca os itens por inteiro: é o que a tela manda, e evita casar item a item.
  const atualizado = await prisma.$transaction(async (tx) => {
    await tx.orcamentoServico.deleteMany({ where: { orcamentoId: id } });
    await tx.orcamentoPeca.deleteMany({ where: { orcamentoId: id } });
    return tx.orcamento.update({
      where: { id },
      data: { ...campos, status, servicos: { create: servicosCreate }, pecas: { create: pecasCreate } },
      include: fullInclude,
    });
  });

  await invalidarCache();
  return toDTO(atualizado);
}

/** Apaga um orçamento que não virou OS. Os itens saem junto (cascade). */
export async function deleteOrcamento(id: string) {
  const atual = await prisma.orcamento.findUnique({ where: { id }, include: { ordem: true } });
  if (!atual) throw new AppError(404, 'Orçamento não encontrado');
  if (atual.ordem) throw new AppError(409, 'Este orçamento já virou uma Ordem de Serviço e não pode ser excluído');

  await prisma.orcamento.delete({ where: { id } });
  await invalidarCache();
}

export async function alterarStatus(id: string, status: StatusOrcamentoInput['status']) {
  const orc = await prisma.orcamento.findUnique({ where: { id } });
  if (!orc) throw new AppError(404, 'Orçamento não encontrado');
  const atualizado = await prisma.orcamento.update({ where: { id }, data: { status }, include: fullInclude });
  await invalidarCache();
  return toDTO(atualizado);
}

// RN-07 (o fluxo-estrela): aprova o orçamento e gera a OS em 1 passo,
// copiando os itens e baixando o estoque das peças (RN-01).
export async function aprovarParaOS(id: string, mecanicoId?: string) {
  const orc = await prisma.orcamento.findUnique({
    where: { id },
    include: { servicos: true, pecas: { include: { peca: true } }, ordem: true },
  });
  if (!orc) throw new AppError(404, 'Orçamento não encontrado');
  if (orc.ordem) throw new AppError(409, 'Este orçamento já virou uma Ordem de Serviço');
  if (orc.status === 'RECUSADO') throw new AppError(400, 'Orçamento recusado não pode virar OS');

  // RN-06: confere a validade aqui também, e não só o status. O status pode estar
  // velho na mão de quem deixou a tela aberta — a data é a fonte da verdade.
  if (orc.status === 'EXPIRADO' || orc.validade < new Date()) {
    throw new AppError(400, 'Orçamento expirado. Refaça o orçamento com os preços de hoje.');
  }

  // RN-03: se faltar peça, a OS nasce "aguardando peça".
  const faltaPeca = orc.pecas.some((item) => item.peca.estoqueAtual < item.quantidade);
  const statusOS = faltaPeca ? 'AGUARDANDO_PECA' : 'ABERTA';

  const criada = await prisma.$transaction(async (tx) => {
    const os = await tx.ordemServico.create({
      data: {
        orcamentoId: orc.id,
        clienteId: orc.clienteId,
        carroId: orc.carroId,
        mecanicoId: mecanicoId ?? null,
        status: statusOS,
        total: orc.total,
        servicos: { create: orc.servicos.map((s) => ({ servicoId: s.servicoId, quantidade: s.quantidade, precoUnit: s.precoUnit })) },
        pecas: { create: orc.pecas.map((p) => ({ pecaId: p.pecaId, quantidade: p.quantidade, precoUnit: p.precoUnit })) },
      },
    });

    // RN-01: baixa o estoque das peças e registra o movimento.
    for (const item of orc.pecas) {
      await tx.peca.update({ where: { id: item.pecaId }, data: { estoqueAtual: { decrement: item.quantidade } } });
      await tx.movimentoEstoque.create({
        data: { pecaId: item.pecaId, tipo: 'SAIDA', quantidade: item.quantidade, motivo: `OS #${os.numero}` },
      });
    }

    await tx.orcamento.update({ where: { id: orc.id }, data: { status: 'APROVADO' } });
    return os;
  });

  await invalidarCache();
  await redis.del('pecas:list'); // o estoque mudou

  const osCompleta = await prisma.ordemServico.findUnique({
    where: { id: criada.id },
    include: {
      cliente: { select: { id: true, nome: true } },
      carro: { select: { id: true, placa: true, modelo: true } },
      servicos: { include: { servico: true } },
      pecas: { include: { peca: true } },
    },
  });
  return { os: osToDTO(osCompleta), aguardandoPeca: faltaPeca };
}
