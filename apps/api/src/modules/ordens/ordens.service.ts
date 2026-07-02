import type { StatusOS } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { AppError } from '../../lib/errors.js';
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
