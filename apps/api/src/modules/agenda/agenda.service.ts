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
