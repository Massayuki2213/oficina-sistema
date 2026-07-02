import type { Servico as PrismaServico } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import type { CreateServicoInput, UpdateServicoInput } from './servicos.schema.js';

const CACHE_KEY = 'servicos:list';
const CACHE_TTL = 60;
const invalidarCache = () => redis.del(CACHE_KEY);

// Converte o Decimal do Prisma para number (contrato do @hermes/shared).
function toDTO(s: PrismaServico) {
  return { ...s, precoMaoDeObra: Number(s.precoMaoDeObra) };
}

export async function listServicos(busca?: string) {
  if (!busca) {
    const hit = await redis.get(CACHE_KEY);
    if (hit) return JSON.parse(hit);
  }

  const servicos = await prisma.servico.findMany({
    where: {
      ativo: true,
      ...(busca
        ? {
            OR: [
              { nome: { contains: busca, mode: 'insensitive' } },
              { categoria: { contains: busca, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { nome: 'asc' },
  });

  const dto = servicos.map(toDTO);
  if (!busca) await redis.set(CACHE_KEY, JSON.stringify(dto), 'EX', CACHE_TTL);
  return dto;
}

export async function getServico(id: string) {
  const servico = await prisma.servico.findUnique({ where: { id } });
  return servico ? toDTO(servico) : null;
}

export async function createServico(data: CreateServicoInput) {
  const servico = await prisma.servico.create({ data });
  await invalidarCache();
  return toDTO(servico);
}

export async function updateServico(id: string, data: UpdateServicoInput) {
  const servico = await prisma.servico.update({ where: { id }, data });
  await invalidarCache();
  return toDTO(servico);
}

// Soft delete: mantém o serviço no histórico das OS antigas, só tira do catálogo.
export async function deactivateServico(id: string) {
  const servico = await prisma.servico.update({ where: { id }, data: { ativo: false } });
  await invalidarCache();
  return toDTO(servico);
}
