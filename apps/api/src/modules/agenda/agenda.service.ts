import type { StatusVisita } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../lib/errors.js';
import type { CreateVisitaInput, UpdateVisitaInput } from './agenda.schema.js';

const includeRel = {
  cliente: { select: { id: true, nome: true, telefone: true } },
  carro: { select: { id: true, placa: true, modelo: true } },
} as const;

function intervalo(de?: string, ate?: string) {
  const gte = de ? new Date(de + 'T00:00:00') : undefined;
  const lte = ate ? new Date(ate + 'T23:59:59.999') : undefined;
  if (!gte && !lte) return {};
  return { dataHora: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } };
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
    include: includeRel,
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
  const lista = conflitos
    .map((c) => `${hora(c.dataHora)} — ${c.cliente.nome}${c.carro ? ` (${c.carro.placa})` : ''}`)
    .join('; ');

  throw new AppError(409, `Já existe agendamento nesse horário: ${lista}. Confirme se quer encaixar mesmo assim.`);
}

async function validarCarroDoCliente(clienteId: string, carroId?: string) {
  if (!carroId) return;
  const carro = await prisma.carro.findUnique({ where: { id: carroId } });
  if (!carro) throw new AppError(400, 'Veículo não encontrado');
  if (carro.clienteId !== clienteId) throw new AppError(400, 'O veículo não pertence a esse cliente');
}

// Lista os agendamentos do período (ordenados pela data/hora), com cliente e veículo.
export function listVisitas(de?: string, ate?: string, status?: StatusVisita) {
  return prisma.visita.findMany({
    where: { ...intervalo(de, ate), ...(status ? { status } : {}) },
    orderBy: { dataHora: 'asc' },
    include: includeRel,
  });
}

export async function createVisita(input: CreateVisitaInput) {
  const cliente = await prisma.cliente.findUnique({ where: { id: input.clienteId } });
  if (!cliente) throw new AppError(400, 'Cliente não encontrado');
  await validarCarroDoCliente(input.clienteId, input.carroId);
  await checarConflito(new Date(input.dataHora), input.ignorarConflito);

  return prisma.visita.create({
    data: {
      clienteId: input.clienteId,
      carroId: input.carroId ?? null,
      dataHora: new Date(input.dataHora),
      tipo: input.tipo,
      observacoes: input.observacoes ?? null,
    },
    include: includeRel,
  });
}

export async function alterarStatus(id: string, status: StatusVisita) {
  try {
    return await prisma.visita.update({ where: { id }, data: { status }, include: includeRel });
  } catch {
    throw new AppError(404, 'Agendamento não encontrado');
  }
}

export async function updateVisita(id: string, input: UpdateVisitaInput) {
  const visita = await prisma.visita.findUnique({ where: { id } });
  if (!visita) throw new AppError(404, 'Agendamento não encontrado');
  await validarCarroDoCliente(visita.clienteId, input.carroId ?? undefined);
  // Remarcar também confere o novo horário (RN-19), ignorando o próprio registro.
  if (input.dataHora) await checarConflito(new Date(input.dataHora), input.ignorarConflito, id);

  return prisma.visita.update({
    where: { id },
    data: {
      ...(input.carroId !== undefined ? { carroId: input.carroId ?? null } : {}),
      ...(input.dataHora ? { dataHora: new Date(input.dataHora) } : {}),
      ...(input.tipo ? { tipo: input.tipo } : {}),
      ...(input.observacoes !== undefined ? { observacoes: input.observacoes ?? null } : {}),
    },
    include: includeRel,
  });
}

export async function deleteVisita(id: string) {
  try {
    await prisma.visita.delete({ where: { id } });
  } catch {
    throw new AppError(404, 'Agendamento não encontrado');
  }
}
