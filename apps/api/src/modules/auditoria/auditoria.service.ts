import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { EntidadeAuditadaDTO, LogAuditoriaDTO, MudancaDTO, Pagina } from '@hermes/shared';
import type { listarAuditoriaQuery } from '@hermes/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { intervalo } from '../../lib/datas.js';
import { pagina, paginar } from '../../lib/paginacao.js';

// Consulta do log de auditoria. É só leitura: ninguém edita nem apaga log —
// um histórico que pode ser alterado não serve como histórico.

/** Traduz a ação técnica para o que o Dono lê na tela. */
const ROTULO_ACAO: Record<string, string> = {
  CRIAR: 'Cadastrou',
  ALTERAR: 'Alterou',
  EXCLUIR: 'Excluiu',
  APROVAR: 'Aprovou e gerou OS',
  DUPLICAR: 'Refez com preços de hoje',
  IDENTIFICAR: 'Vinculou cliente e veículo',
  RECEBER: 'Recebeu pagamento',
  ESTORNAR_PAGAMENTO: 'Estornou pagamento',
  PAGAR: 'Pagou',
  ACERTO: 'Acertou conta do distribuidor',
  STATUS: 'Mudou o status',
  MECANICO: 'Trocou o mecânico',
  ASSUMIR: 'Assumiu a OS',
  CANCELAR: 'Cancelou',
  GARANTIA: 'Abriu garantia',
  ADICIONAR_SERVICO: 'Lançou serviço',
  ALTERAR_SERVICO: 'Alterou serviço',
  REMOVER_SERVICO: 'Tirou serviço',
  ADICIONAR_PECA: 'Lançou peça',
  ALTERAR_PECA: 'Alterou peça',
  REMOVER_PECA: 'Tirou peça',
  ENTRADA: 'Deu entrada no estoque',
  AJUSTE: 'Ajustou o estoque (inventário)',
  PROXIMO_MES: 'Lançou a do próximo mês',
  LANCAR_FIADO: 'Lançou fiado',
  ANONIMIZAR: 'Anonimizou (LGPD)',
  SENHA: 'Redefiniu a senha de alguém',
  MINHA_SENHA: 'Trocou a própria senha',
  ATIVO: 'Ativou/inativou o usuário',
  PRIMEIRO_ACESSO: 'Configurou o sistema',
  LOGIN: 'Entrou no sistema',
  LOGIN_FALHOU: 'Errou a senha ao entrar',
  SENHA_DONO_INCORRETA: 'Errou a senha do Dono (desconto)',
  ENCERRAR_SESSAO: 'Saiu de um aparelho',
  ENCERRAR_OUTRAS_SESSOES: 'Saiu dos outros aparelhos',
  ENCERRAR_SESSOES: 'Derrubou as sessões de alguém',
  REDEFINIR_SENHA_CLI: 'Senha redefinida no servidor',
};

const ROTULO_ENTIDADE: Record<string, string> = {
  auth: 'Acesso',
  clientes: 'Cliente',
  carros: 'Veículo',
  servicos: 'Serviço',
  pecas: 'Peça',
  orcamentos: 'Orçamento',
  ordens: 'Ordem de Serviço',
  vendas: 'Venda de balcão',
  agenda: 'Agenda',
  caixa: 'Livro-caixa',
  despesas: 'Despesa',
  'contas-receber': 'Conta a receber',
  compras: 'Compra',
  fornecedores: 'Distribuidor',
  usuarios: 'Usuário',
  oficina: 'Oficina',
  backup: 'Cópia de segurança',
};

export async function listar(q: z.output<typeof listarAuditoriaQuery>): Promise<Pagina<LogAuditoriaDTO>> {
  const periodo = intervalo(q.de, q.ate);
  const where: Prisma.LogAuditoriaWhereInput = {
    ...(q.entidade ? { entidade: q.entidade } : {}),
    ...(q.usuarioId ? { usuarioId: q.usuarioId } : {}),
    ...(periodo ? { data: periodo } : {}),
    ...(q.busca ? { detalhes: { contains: q.busca, mode: 'insensitive' } } : {}),
  };

  const [logs, total] = await prisma.$transaction([
    prisma.logAuditoria.findMany({
      where,
      orderBy: { data: 'desc' },
      include: { usuario: { select: { id: true, nome: true, perfil: true } } },
      ...paginar(q),
    }),
    prisma.logAuditoria.count({ where }),
  ]);

  return pagina(
    logs.map((l) => ({
      id: l.id,
      data: l.data.toISOString(),
      acao: l.acao,
      entidade: l.entidade,
      entidadeId: l.entidadeId,
      detalhes: l.detalhes,
      mudancas: (l.mudancas as MudancaDTO[] | null) ?? null,
      // Quem fez. Usuário apagado deixa o log em pé — por isso usuarioId é opcional.
      usuario: l.usuario,
      descricao: `${ROTULO_ACAO[l.acao] ?? l.acao} · ${ROTULO_ENTIDADE[l.entidade] ?? l.entidade}`,
    })),
    total,
    q,
  );
}

/** Entidades que já apareceram no log — alimenta o filtro da tela. */
export async function entidades(): Promise<EntidadeAuditadaDTO[]> {
  const linhas = await prisma.logAuditoria.groupBy({ by: ['entidade'], _count: { entidade: true } });
  return linhas
    .map((l) => ({ entidade: l.entidade, rotulo: ROTULO_ENTIDADE[l.entidade] ?? l.entidade, total: l._count.entidade }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}
