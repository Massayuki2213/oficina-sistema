import type { StatusOS } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { AppError } from '../../lib/errors.js';
import { situacaoFiado } from '../alertas/alertas.service.js';
import { getOficina } from '../oficina/oficina.service.js';
import type { ReceberInput } from './ordens.schema.js';

const num = (v: unknown) => Number(v);

const includeFull = {
  cliente: true,
  carro: true,
  mecanico: { select: { id: true, nome: true } },
  servicos: { include: { servico: true } },
  pecas: { include: { peca: true } },
} as const;

function osToDTO(o: any) {
  return {
    ...o,
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

// Transições válidas do fluxo de trabalho da OS.
const TRANSICOES: Record<StatusOS, StatusOS[]> = {
  ABERTA: ['EM_EXECUCAO', 'AGUARDANDO_PECA', 'CANCELADA'],
  AGUARDANDO_PECA: ['EM_EXECUCAO', 'CANCELADA'],
  EM_EXECUCAO: ['AGUARDANDO_PECA', 'CONCLUIDA', 'CANCELADA'],
  AGUARDANDO_APROVACAO: ['EM_EXECUCAO', 'CANCELADA'],
  CONCLUIDA: ['ENTREGUE', 'EM_EXECUCAO'],
  ENTREGUE: [],
  CANCELADA: [],
};

export async function listOrdens(busca?: string, status?: StatusOS) {
  const ordens = await prisma.ordemServico.findMany({
    orderBy: { dataAbertura: 'desc' },
    where: {
      ...(status ? { status } : {}),
      ...(busca
        ? {
            OR: [
              { cliente: { nome: { contains: busca, mode: 'insensitive' } } },
              { carro: { placa: { contains: busca.toUpperCase().replace(/[^A-Z0-9]/g, '') } } },
            ],
          }
        : {}),
    },
    include: {
      cliente: { select: { id: true, nome: true } },
      carro: { select: { id: true, placa: true, modelo: true } },
      mecanico: { select: { id: true, nome: true } },
    },
  });
  return ordens.map((o) => ({ ...o, total: num(o.total) }));
}

export async function getOrdem(id: string) {
  const os = await prisma.ordemServico.findUnique({ where: { id }, include: includeFull });
  return os ? osToDTO(os) : null;
}

export async function mudarStatus(id: string, novo: StatusOS) {
  const os = await prisma.ordemServico.findUnique({
    where: { id },
    include: { _count: { select: { servicos: true, pecas: true } } },
  });
  if (!os) throw new AppError(404, 'Ordem de Serviço não encontrada');

  if (os.status === novo) return getOrdem(id);
  if (!TRANSICOES[os.status].includes(novo)) {
    throw new AppError(400, `Não é possível mudar de "${os.status}" para "${novo}"`);
  }
  // RN-10: não conclui sem pelo menos 1 serviço ou peça.
  if (novo === 'CONCLUIDA' && os._count.servicos + os._count.pecas === 0) {
    throw new AppError(400, 'A OS precisa de ao menos 1 serviço ou peça para ser concluída');
  }

  const atualizada = await prisma.ordemServico.update({
    where: { id },
    data: { status: novo, ...(novo === 'CONCLUIDA' ? { dataConclusao: new Date() } : {}) },
    include: includeFull,
  });
  await redis.del('ordens:list');
  return osToDTO(atualizada);
}

export async function atribuirMecanico(id: string, mecanicoId: string) {
  const mec = await prisma.usuario.findUnique({ where: { id: mecanicoId } });
  if (!mec) throw new AppError(400, 'Mecânico não encontrado');
  if (mec.perfil !== 'MECANICO') throw new AppError(400, 'Esse usuário não é um mecânico');
  try {
    const os = await prisma.ordemServico.update({ where: { id }, data: { mecanicoId }, include: includeFull });
    return osToDTO(os);
  } catch {
    throw new AppError(404, 'Ordem de Serviço não encontrada');
  }
}

// RN-11: receber pagamento. À vista/PIX/cartão gera entrada no caixa na hora;
// parcelado/fiado gera as parcelas em Contas a Receber (RN-11.1).
export async function receberPagamento(id: string, input: ReceberInput, usuarioId: string) {
  const os = await prisma.ordemServico.findUnique({ where: { id }, include: { cliente: true } });
  if (!os) throw new AppError(404, 'Ordem de Serviço não encontrada');
  if (os.pago) throw new AppError(409, 'Esta OS já está paga');
  if (os.status === 'CANCELADA') throw new AppError(400, 'OS cancelada não recebe pagamento');
  if (!['CONCLUIDA', 'ENTREGUE'].includes(os.status)) {
    throw new AppError(400, 'Conclua a OS antes de receber o pagamento');
  }

  const total = num(os.total);
  const aVista = ['A_VISTA', 'PIX', 'CARTAO'].includes(input.formaPagamento);
  const DIA = 24 * 60 * 60 * 1000;

  // RN-11.2: quem já tem parcela vencida não leva mais fiado sem alguém assumir.
  // Só vale para venda a prazo — pagamento à vista quita e nunca é barrado.
  if (!aVista && !input.liberarFiado) {
    const situacao = await situacaoFiado(os.clienteId);
    if (situacao.bloqueado) {
      throw new AppError(
        409,
        `${os.cliente.nome} tem ${situacao.parcelasVencidas} parcela(s) vencida(s), ` +
          `somando ${situacao.valorVencido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. ` +
          'Receba à vista ou libere o fiado assumindo o risco.',
      );
    }
  }

  const atualizada = await prisma.$transaction(async (tx) => {
    if (aVista) {
      // Entrada automática no livro-caixa (RN-11).
      await tx.lancamentoCaixa.create({
        data: {
          tipo: 'ENTRADA',
          origem: 'OS',
          descricao: `OS #${os.numero} — ${os.cliente.nome}`,
          valor: total,
          formaPagamento: input.formaPagamento,
          categoria: 'Ordem de Serviço',
          osId: os.id,
          usuarioId,
        },
      });
      return tx.ordemServico.update({
        where: { id },
        data: { pago: true, formaPagamento: input.formaPagamento, status: 'ENTREGUE' },
        include: includeFull,
      });
    }

    // Parcelado/fiado: cria as parcelas (a entrada no caixa vem quando cada uma é recebida).
    const base = Math.floor((total / input.parcelas) * 100) / 100;
    const parcelas = Array.from({ length: input.parcelas }, (_, i) => {
      const ultima = i === input.parcelas - 1;
      return {
        clienteId: os.clienteId,
        osId: os.id,
        parcela: i + 1,
        totalParcelas: input.parcelas,
        vencimento: new Date(Date.now() + input.primeiroVencimentoDias * DIA + i * 30 * DIA),
        valor: ultima ? Number((total - base * (input.parcelas - 1)).toFixed(2)) : base,
      };
    });
    await tx.contaReceber.createMany({ data: parcelas });
    return tx.ordemServico.update({
      where: { id },
      data: { pago: false, formaPagamento: input.formaPagamento, status: 'ENTREGUE' },
      include: includeFull,
    });
  });

  await redis.del('ordens:list');
  return { os: osToDTO(atualizada), aVista, parcelas: aVista ? 0 : input.parcelas };
}

/**
 * RN-18 — abre uma OS de GARANTIA a partir de uma OS já concluída.
 *
 * O carro voltou dentro do prazo pelo mesmo problema: refaz o serviço sem
 * cobrar. Decisões que valem registrar:
 *
 *  - total = 0 e nasce já paga. Garantia não gera receita; deixá-la "a receber"
 *    sujaria o caixa e as contas a receber com uma dívida que não existe.
 *  - copia só os SERVIÇOS, não as peças. Refazer a mão de obra é o compromisso
 *    da garantia; peça nova é custo real e entra pelo fluxo normal, senão o
 *    estoque baixa sem ninguém ver.
 *  - guarda `osOrigemId`, para o histórico do veículo mostrar o retorno.
 */
export async function abrirGarantia(id: string, mecanicoId?: string) {
  const origem = await prisma.ordemServico.findUnique({
    where: { id },
    include: { servicos: true, cliente: true, garantias: { select: { id: true, numero: true } } },
  });
  if (!origem) throw new AppError(404, 'Ordem de Serviço não encontrada');
  if (origem.garantia) throw new AppError(400, 'Esta OS já é uma garantia. Abra a garantia pela OS original.');
  if (!['CONCLUIDA', 'ENTREGUE'].includes(origem.status)) {
    throw new AppError(400, 'Só cabe garantia depois que o serviço foi concluído');
  }
  if (origem.servicos.length === 0) {
    throw new AppError(400, 'Esta OS não tem serviço de mão de obra para cobrir em garantia');
  }

  // O prazo conta da conclusão; se ela faltar, cai para a abertura.
  const { garantiaDias } = await getOficina();
  const referencia = origem.dataConclusao ?? origem.dataAbertura;
  const limite = new Date(referencia.getTime() + garantiaDias * 24 * 60 * 60 * 1000);
  if (new Date() > limite) {
    throw new AppError(
      400,
      `A garantia de ${garantiaDias} dias venceu em ${limite.toLocaleDateString('pt-BR')}. ` +
        'Abra uma OS normal para este atendimento.',
    );
  }

  const criada = await prisma.ordemServico.create({
    data: {
      clienteId: origem.clienteId,
      carroId: origem.carroId,
      mecanicoId: mecanicoId ?? origem.mecanicoId,
      osOrigemId: origem.id,
      garantia: true,
      status: 'ABERTA',
      total: 0,
      pago: true,
      servicos: {
        create: origem.servicos.map((s) => ({ servicoId: s.servicoId, quantidade: s.quantidade, precoUnit: 0 })),
      },
    },
    include: includeFull,
  });

  await redis.del('ordens:list');
  return { os: osToDTO(criada), origem: { id: origem.id, numero: origem.numero }, garantiaAte: limite };
}

/** Situação da garantia de uma OS — alimenta o botão da tela. */
export async function situacaoGarantia(id: string) {
  const os = await prisma.ordemServico.findUnique({
    where: { id },
    select: { id: true, status: true, garantia: true, dataAbertura: true, dataConclusao: true, garantias: { select: { id: true, numero: true } } },
  });
  if (!os) throw new AppError(404, 'Ordem de Serviço não encontrada');

  const { garantiaDias } = await getOficina();
  const referencia = os.dataConclusao ?? os.dataAbertura;
  const limite = new Date(referencia.getTime() + garantiaDias * 24 * 60 * 60 * 1000);
  const concluida = ['CONCLUIDA', 'ENTREGUE'].includes(os.status);

  return {
    elegivel: concluida && !os.garantia && new Date() <= limite,
    ehGarantia: os.garantia,
    garantiaAte: limite,
    diasRestantes: Math.max(0, Math.ceil((limite.getTime() - Date.now()) / (24 * 60 * 60 * 1000))),
    garantiasAbertas: os.garantias,
  };
}
