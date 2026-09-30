import type { Oficina } from '@prisma/client';
import type { OficinaDTO } from '@hermes/shared';
import type { z } from 'zod';
import type { oficinaSchema } from '@hermes/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { num } from '../../lib/dinheiro.js';
import { falhaDeVersao, naVersao, proximaVersao } from '../../lib/versao.js';

// Configuração da oficina: uma linha só, id fixo. Tira do código o que é do
// negócio — identidade no documento impresso, margem, teto de desconto
// (RN-08), prazo de garantia (RN-18) e validade do orçamento (RN-06).

const ID = 'unica';

function paraDTO(o: Oficina): OficinaDTO {
  return {
    versao: o.versao,
    nome: o.nome,
    subtitulo: o.subtitulo,
    cnpj: o.cnpj,
    telefone: o.telefone,
    email: o.email,
    endereco: o.endereco,
    logo: o.logo,
    observacoesDocumento: o.observacoesDocumento,
    margemPadrao: num(o.margemPadrao),
    descontoMaxSemSenha: num(o.descontoMaxSemSenha),
    garantiaDias: o.garantiaDias,
    validadeOrcamentoDias: o.validadeOrcamentoDias,
  };
}

/**
 * Devolve a configuração, criando a linha padrão na primeira chamada.
 * Assim o sistema funciona antes de alguém abrir Configurações.
 */
export async function getOficina(): Promise<OficinaDTO> {
  const oficina = await prisma.oficina.upsert({ where: { id: ID }, update: {}, create: { id: ID } });
  return paraDTO(oficina);
}

export async function updateOficina({ versao, ...dados }: z.output<typeof oficinaSchema>): Promise<OficinaDTO> {
  await getOficina(); // garante a linha (primeira configuração)
  const r = await prisma.oficina.updateMany({ where: { id: ID, ...naVersao(versao) }, data: { ...dados, ...proximaVersao } });
  if (r.count === 0) await falhaDeVersao('oficina', null, true, 'Configuração não encontrada');
  return paraDTO(await prisma.oficina.findUniqueOrThrow({ where: { id: ID } }));
}
