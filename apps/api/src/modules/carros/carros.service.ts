import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { normalizarPlaca, type CreateCarroInput, type UpdateCarroInput } from './carros.schema.js';

const CACHE_KEY = 'carros:list';
const CACHE_TTL = 60;
const invalidarCache = () => redis.del(CACHE_KEY);

export async function listCarros(busca?: string) {
  if (!busca) {
    const hit = await redis.get(CACHE_KEY);
    if (hit) return JSON.parse(hit);
  }

  const carros = await prisma.carro.findMany({
    where: busca
      ? {
          OR: [
            { placa: { contains: normalizarPlaca(busca) } },
            { marca: { contains: busca, mode: 'insensitive' } },
            { modelo: { contains: busca, mode: 'insensitive' } },
            { cliente: { nome: { contains: busca, mode: 'insensitive' } } },
          ],
        }
      : {},
    orderBy: { placa: 'asc' },
    include: { cliente: { select: { id: true, nome: true, telefone: true } } },
  });

  if (!busca) await redis.set(CACHE_KEY, JSON.stringify(carros), 'EX', CACHE_TTL);
  return carros;
}

// RN-16: buscar pela placa puxa o carro + dono + histórico de OS.
export async function buscarPorPlaca(placa: string) {
  const carro = await prisma.carro.findUnique({
    where: { placa: normalizarPlaca(placa) },
    include: {
      cliente: true,
      ordens: { orderBy: { dataAbertura: 'desc' }, take: 10 },
    },
  });
  return carro;
}

// Detalhe com dono e histórico completo (RN-17).
export async function getCarro(id: string) {
  return prisma.carro.findUnique({
    where: { id },
    include: {
      cliente: true,
      ordens: { orderBy: { dataAbertura: 'desc' } },
    },
  });
}

export async function createCarro(data: CreateCarroInput) {
  const carro = await prisma.carro.create({ data });
  await invalidarCache();
  return carro;
}

export async function updateCarro(id: string, data: UpdateCarroInput) {
  const carro = await prisma.carro.update({ where: { id }, data });
  await invalidarCache();
  return carro;
}
