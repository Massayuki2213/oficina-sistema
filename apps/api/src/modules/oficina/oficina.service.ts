import type { Oficina } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import type { UpdateOficinaInput } from './oficina.schema.js';

// Configuração da oficina: uma linha só, id fixo. Tira do código o que é do
// negócio — identidade no documento impresso, margem, teto de desconto (RN-08)
// e prazo de garantia (RN-18).

const ID = 'unica';
const num = (v: unknown) => Number(v);

/** Decimal do Prisma vira number — contrato do @hermes/shared. */
function toDTO(o: Oficina) {
  return { ...o, margemPadrao: num(o.margemPadrao), descontoMaxSemSenha: num(o.descontoMaxSemSenha) };
}

/**
 * Devolve a configuração, criando a linha padrão na primeira chamada.
 * Assim o sistema funciona antes de alguém abrir Configurações.
 */
export async function getOficina() {
  const oficina = await prisma.oficina.upsert({ where: { id: ID }, update: {}, create: { id: ID } });
  return toDTO(oficina);
}

export async function updateOficina(data: UpdateOficinaInput) {
  const oficina = await prisma.oficina.upsert({
    where: { id: ID },
    update: data,
    create: { id: ID, ...data },
  });
  return toDTO(oficina);
}
