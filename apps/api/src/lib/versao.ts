import { prisma } from './prisma.js';
import { COD, conflito, naoEncontrado } from './errors.js';

// ============================================================
// Concorrência otimista (ADR 0010).
//
// Formulário que grava o registro inteiro (cliente, peça, orçamento,
// dados da OS...) manda a `versao` que carregou. A gravação é um
// UPDATE ... WHERE id = ? AND versao = ? — atômico no banco: se
// alguém salvou no meio do caminho, nada é gravado e a pessoa fica
// sabendo quem salvou e quando, em vez de apagar o trabalho do outro
// sem ninguém perceber ("o último a salvar ganha").
//
// Itens, status e dinheiro não passam por aqui: são ações pequenas,
// já protegidas por trava de linha, e não sobrescrevem nada.
// ============================================================

/** Filtro do compare-and-set: com versão informada, só acha o registro se ela bater. */
export const naVersao = (versao: number | undefined) => (versao === undefined ? {} : { versao });

/** O incremento que acompanha toda gravação de formulário. */
export const proximaVersao = { versao: { increment: 1 } } as const;

function quando(em: Date) {
  const hora = em.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return em.toDateString() === new Date().toDateString() ? `às ${hora}` : `em ${em.toLocaleDateString('pt-BR')} às ${hora}`;
}

/**
 * A gravação não achou o registro na versão esperada: ou ele não existe
 * (404), ou alguém salvou depois que a tela carregou (409 CONFLITO_EDICAO,
 * com quem e quando — tirado do Histórico).
 *
 * @param entidade  como a auditoria chama a entidade ("clientes", "ordens"...)
 * @param entidadeId o id no Histórico (null na configuração da oficina, que é única)
 */
export async function falhaDeVersao(entidade: string, entidadeId: string | null, existe: boolean, naoAchou: string): Promise<never> {
  if (!existe) throw naoEncontrado(naoAchou);
  const ultimo = await prisma.logAuditoria.findFirst({
    where: { entidade, ...(entidadeId ? { entidadeId } : {}) },
    orderBy: { data: 'desc' },
    select: { data: true, usuario: { select: { nome: true } } },
  });
  const por = ultimo?.usuario?.nome ?? null;
  const em = ultimo?.data ?? null;
  throw conflito(
    `${por ?? 'Outra pessoa'} salvou uma alteração aqui${em ? ` ${quando(em)}` : ''}, depois que você abriu a tela. ` +
      'O que você mudou não foi gravado: feche, abra de novo para ver a versão atual e refaça a sua alteração.',
    COD.CONFLITO_EDICAO,
    { por, em: em?.toISOString() ?? null },
  );
}
