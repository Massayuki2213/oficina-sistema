import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import type { CreateClienteInput, UpdateClienteInput } from './clientes.schema.js';

// Cache da listagem no Redis (banco + cache trabalhando juntos).
// Invalidado a cada escrita para não mostrar dado velho.
const CACHE_KEY = 'clientes:list';
const CACHE_TTL = 60; // segundos

async function invalidarCache() {
  await redis.del(CACHE_KEY);
}

// Lista clientes ativos. Sem busca -> usa cache. Com busca -> sempre no banco.
export async function listClientes(busca?: string) {
  if (!busca) {
    const hit = await redis.get(CACHE_KEY);
    if (hit) return JSON.parse(hit);
  }

  const clientes = await prisma.cliente.findMany({
    where: {
      ativo: true,
      ...(busca
        ? {
            OR: [
              { nome: { contains: busca, mode: 'insensitive' } },
              { cpfCnpj: { contains: busca } },
              { telefone: { contains: busca } },
            ],
          }
        : {}),
    },
    orderBy: { nome: 'asc' },
    include: { _count: { select: { carros: true } } },
  });

  if (!busca) await redis.set(CACHE_KEY, JSON.stringify(clientes), 'EX', CACHE_TTL);
  return clientes;
}

// Detalhe do cliente: veículos, últimas OS e situação de fiado (RN-11.2).
export async function getCliente(id: string) {
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: {
      carros: { where: { ativo: true }, orderBy: { placa: 'asc' } },
      contasReceber: {
        where: { status: { in: ['PENDENTE', 'ATRASADA'] } },
        orderBy: { vencimento: 'asc' },
      },
      ordens: {
        orderBy: { dataAbertura: 'desc' },
        take: 10,
        include: { carro: true },
      },
    },
  });

  if (!cliente) return null;

  const fiadoEmAberto = cliente.contasReceber.reduce((soma, c) => soma + Number(c.valor), 0);
  const temAtraso = cliente.contasReceber.some((c) => c.status === 'ATRASADA');

  return { ...cliente, fiadoEmAberto, temAtraso };
}

export async function createCliente(data: CreateClienteInput) {
  const cliente = await prisma.cliente.create({ data });
  await invalidarCache();
  return cliente;
}

export async function updateCliente(id: string, data: UpdateClienteInput) {
  const cliente = await prisma.cliente.update({ where: { id }, data });
  await invalidarCache();
  return cliente;
}

// Soft delete: mantém o histórico, apenas marca como inativo.
export async function deactivateCliente(id: string) {
  const cliente = await prisma.cliente.update({ where: { id }, data: { ativo: false } });
  await invalidarCache();
  return cliente;
}
