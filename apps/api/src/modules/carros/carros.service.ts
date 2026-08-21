import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';
import { situacaoFiado } from '../alertas/alertas.service.js';
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
    where: {
      ativo: true,
      ...(busca
        ? {
            OR: [
              { placa: { contains: normalizarPlaca(busca) } },
              { marca: { contains: busca, mode: 'insensitive' } },
              { modelo: { contains: busca, mode: 'insensitive' } },
              { cliente: { nome: { contains: busca, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: { placa: 'asc' },
    include: { cliente: { select: { id: true, nome: true, telefone: true } } },
  });

  if (!busca) await redis.set(CACHE_KEY, JSON.stringify(carros), 'EX', CACHE_TTL);
  return carros;
}

/**
 * RN-16/17 — a consulta que abre o atendimento no balcão.
 *
 * Digitou a placa, aparece tudo que o atendente precisa saber antes de falar
 * com o cliente: o veículo, o dono, se ele está devendo e o que já foi feito
 * no carro. É a promessa de agilidade do sistema, então vem num pacote só —
 * uma ida ao servidor, sem a tela ter que montar o quebra-cabeça.
 */
export async function buscarPorPlaca(placa: string) {
  const carro = await prisma.carro.findUnique({
    where: { placa: normalizarPlaca(placa) },
    include: {
      cliente: true,
      ordens: {
        orderBy: { dataAbertura: 'desc' },
        take: 10,
        include: {
          mecanico: { select: { nome: true } },
          servicos: { include: { servico: { select: { nome: true } } } },
        },
      },
    },
  });
  if (!carro) return null;

  const fiado = await situacaoFiado(carro.clienteId);

  return {
    ...carro,
    // Decimal do Prisma vira number: a tela formata como dinheiro.
    ordens: carro.ordens.map((o) => ({
      id: o.id,
      numero: o.numero,
      dataAbertura: o.dataAbertura,
      dataConclusao: o.dataConclusao,
      status: o.status,
      total: Number(o.total),
      pago: o.pago,
      garantia: o.garantia,
      kmEntrada: o.kmEntrada,
      mecanico: o.mecanico?.nome ?? null,
      // O que foi feito, em uma linha — é o que responde "já mexemos nisso?".
      servicos: o.servicos.map((s) => s.servico.nome),
    })),
    fiado,
  };
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

// Soft delete: mantém o histórico de OS, só tira o veículo da lista ativa.
export async function deactivateCarro(id: string) {
  const carro = await prisma.carro.update({ where: { id }, data: { ativo: false } });
  await invalidarCache();
  return carro;
}
