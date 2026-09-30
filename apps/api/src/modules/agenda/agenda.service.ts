import type { Prisma, StatusVisita } from '@prisma/client';
import type { z } from 'zod';
import type { VisitaDTO } from '@hermes/shared';
import type { atualizarVisitaSchema, listarAgendaQuery, visitaSchema } from '@hermes/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { COD, conflito, invalido, naoEncontrado } from '../../lib/errors.js';
import { falhaDeVersao, naVersao, proximaVersao } from '../../lib/versao.js';
import { intervalo } from '../../lib/datas.js';

const incluirRel = {
  cliente: { select: { id: true, nome: true, telefone: true, whatsapp: true } },
  carro: { select: { id: true, placa: true, modelo: true } },
} satisfies Prisma.VisitaInclude;

type VisitaCompleta = Prisma.VisitaGetPayload<{ include: typeof incluirRel }>;

function paraDTO(v: VisitaCompleta): VisitaDTO {
  return {
    id: v.id,
    versao: v.versao,
    dataHora: v.dataHora.toISOString(),
    tipo: v.tipo,
    status: v.status,
    observacoes: v.observacoes,
    cliente: v.cliente,
    carro: v.carro,
  };
}

/**
 * RN-19 — janela que caracteriza conflito de horário.
 * A visita não tem duração cadastrada, então 30 min para cada lado é a
 * aproximação honesta: dois carros marcados no mesmo intervalo disputam o box.
 */
const JANELA_CONFLITO_MIN = 30;

/** Agendamentos vivos que caem na mesma janela — ignorando o próprio, ao remarcar. */
async function buscarConflitos(dataHora: Date, ignorarId?: string) {
  const margem = JANELA_CONFLITO_MIN * 60 * 1000;
  return prisma.visita.findMany({
    where: {
      ...(ignorarId ? { id: { not: ignorarId } } : {}),
      status: { in: ['AGENDADA', 'CONFIRMADA'] },
      dataHora: { gte: new Date(dataHora.getTime() - margem), lte: new Date(dataHora.getTime() + margem) },
    },
    include: incluirRel,
    orderBy: { dataHora: 'asc' },
  });
}

/**
 * RN-19: avisa o conflito em vez de proibir. A oficina às vezes encaixa dois
 * carros de propósito — quem decide é o atendente, não o sistema. Por isso o
 * 409 traz o que conflitou e a chamada pode ser repetida com `ignorarConflito`.
 */
async function checarConflito(dataHora: Date, ignorarConflito: boolean, ignorarId?: string) {
  if (ignorarConflito) return;
  const conflitos = await buscarConflitos(dataHora, ignorarId);
  if (conflitos.length === 0) return;

  const hora = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const lista = conflitos.map((c) => `${hora(c.dataHora)} — ${c.cliente.nome}${c.carro ? ` (${c.carro.placa})` : ''}`).join('; ');
  throw conflito(
    `Já existe agendamento nesse horário: ${lista}. Confirme se quer encaixar mesmo assim.`,
    COD.CONFLITO_AGENDA,
    conflitos.map(paraDTO),
  );
}

async function validarCarroDoCliente(clienteId: string, carroId?: string | null) {
  if (!carroId) return;
  const carro = await prisma.carro.findUnique({ where: { id: carroId }, select: { clienteId: true } });
  if (!carro) throw invalido('Veículo não encontrado');
  if (carro.clienteId !== clienteId) throw invalido('O veículo não pertence a esse cliente');
}

export async function listar(q: z.output<typeof listarAgendaQuery>): Promise<VisitaDTO[]> {
  const periodo = intervalo(q.de, q.ate);
  const visitas = await prisma.visita.findMany({
    where: { ...(periodo ? { dataHora: periodo } : {}), ...(q.status ? { status: q.status } : {}) },
    orderBy: { dataHora: 'asc' },
    include: incluirRel,
    take: 500,
  });
  return visitas.map(paraDTO);
}

export async function criar(dados: z.output<typeof visitaSchema>): Promise<VisitaDTO> {
  const cliente = await prisma.cliente.findUnique({ where: { id: dados.clienteId }, select: { ativo: true } });
  if (!cliente || !cliente.ativo) throw invalido('Cliente não encontrado');
  await validarCarroDoCliente(dados.clienteId, dados.carroId);
  const dataHora = new Date(dados.dataHora);
  await checarConflito(dataHora, dados.ignorarConflito);

  const v = await prisma.visita.create({
    data: {
      clienteId: dados.clienteId,
      carroId: dados.carroId ?? null,
      dataHora,
      tipo: dados.tipo,
      observacoes: dados.observacoes ?? null,
    },
    include: incluirRel,
  });
  return paraDTO(v);
}

export async function alterarStatus(id: string, status: StatusVisita): Promise<VisitaDTO> {
  const v = await prisma.visita.update({ where: { id }, data: { status }, include: incluirRel });
  return paraDTO(v);
}

/** Remarcar / editar. O novo horário também passa pela checagem de conflito (RN-19). */
export async function atualizar(id: string, dados: z.output<typeof atualizarVisitaSchema>): Promise<VisitaDTO> {
  const visita = await prisma.visita.findUnique({ where: { id } });
  if (!visita) throw naoEncontrado('Agendamento não encontrado');
  await validarCarroDoCliente(visita.clienteId, dados.carroId);
  if (dados.dataHora) await checarConflito(new Date(dados.dataHora), dados.ignorarConflito, id);

  const r = await prisma.visita.updateMany({
    where: { id, ...naVersao(dados.versao) },
    data: {
      ...(dados.carroId !== undefined ? { carroId: dados.carroId } : {}),
      ...(dados.dataHora ? { dataHora: new Date(dados.dataHora) } : {}),
      ...(dados.tipo ? { tipo: dados.tipo } : {}),
      ...(dados.observacoes !== undefined ? { observacoes: dados.observacoes } : {}),
      ...proximaVersao,
    },
  });
  if (r.count === 0) await falhaDeVersao('agenda', id, true, 'Agendamento não encontrado');
  return paraDTO(await prisma.visita.findUniqueOrThrow({ where: { id }, include: incluirRel }));
}

export async function excluir(id: string) {
  await prisma.visita.delete({ where: { id } });
}
