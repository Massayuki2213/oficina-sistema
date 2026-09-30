import type { Prisma, Servico } from '@prisma/client';
import type { z } from 'zod';
import type { Pagina, ServicoDTO } from '@hermes/shared';
import type { listarServicosQuery, servicoSchema } from '@hermes/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { num } from '../../lib/dinheiro.js';
import { pagina, paginar } from '../../lib/paginacao.js';
import { falhaDeVersao, naVersao, proximaVersao } from '../../lib/versao.js';

// Catálogo de mão de obra. O preço daqui é o de tabela: ao entrar num
// orçamento ou OS ele é "congelado" no item (mudar o catálogo depois não
// altera o que já foi combinado com o cliente).

function paraDTO(s: Servico): ServicoDTO {
  return {
    id: s.id,
    versao: s.versao,
    nome: s.nome,
    descricao: s.descricao,
    precoMaoDeObra: num(s.precoMaoDeObra),
    tempoEstimadoMin: s.tempoEstimadoMin,
    categoria: s.categoria,
    ativo: s.ativo,
  };
}

export async function listar(q: z.output<typeof listarServicosQuery>): Promise<Pagina<ServicoDTO>> {
  const where: Prisma.ServicoWhereInput = {
    ativo: true,
    ...(q.busca
      ? {
          OR: [
            { nome: { contains: q.busca, mode: 'insensitive' } },
            { categoria: { contains: q.busca, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [itens, total] = await prisma.$transaction([
    prisma.servico.findMany({ where, orderBy: { nome: 'asc' }, ...paginar(q) }),
    prisma.servico.count({ where }),
  ]);
  return pagina(itens.map(paraDTO), total, q);
}

export async function buscar(id: string): Promise<ServicoDTO> {
  return paraDTO(await prisma.servico.findUniqueOrThrow({ where: { id } }));
}

export async function criar(dados: z.output<typeof servicoSchema>) {
  return paraDTO(await prisma.servico.create({ data: dados }));
}

export async function atualizar(id: string, { versao, ...dados }: z.output<typeof servicoSchema>) {
  const r = await prisma.servico.updateMany({ where: { id, ...naVersao(versao) }, data: { ...dados, ...proximaVersao } });
  if (r.count === 0) await falhaDeVersao('servicos', id, (await prisma.servico.count({ where: { id } })) > 0, 'Serviço não encontrado');
  return buscar(id);
}

/** Sai do catálogo, mas continua nas OS antigas. */
export async function inativar(id: string) {
  await prisma.servico.update({ where: { id }, data: { ativo: false } });
}
