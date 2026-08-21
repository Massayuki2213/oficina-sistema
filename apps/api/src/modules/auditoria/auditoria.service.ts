import { prisma } from '../../lib/prisma.js';

// Consulta do log de auditoria. É só leitura: ninguém edita nem apaga log —
// um histórico que pode ser alterado não serve como histórico.

export interface FiltrosAuditoria {
  entidade?: string;
  usuarioId?: string;
  de?: string;
  ate?: string;
  limite?: number;
}

/** Traduz a ação técnica para o que o Dono lê na tela. */
const ROTULO_ACAO: Record<string, string> = {
  CRIAR: 'Cadastrou',
  ALTERAR: 'Alterou',
  EXCLUIR: 'Excluiu',
  APROVAR: 'Aprovou e gerou OS',
  RECEBER: 'Recebeu pagamento',
  PAGAR: 'Pagou',
  ACERTO: 'Acertou conta do distribuidor',
  STATUS: 'Mudou o status',
  MECANICO: 'Trocou o mecânico',
  ESTOQUE: 'Mexeu no estoque',
  SENHA: 'Redefiniu a senha de alguém',
  MINHA_SENHA: 'Trocou a própria senha',
  ATIVO: 'Ativou/inativou o usuário',
  LOGIN: 'Entrou no sistema',
  LOGIN_FALHOU: 'Errou a senha ao entrar',
};

const ROTULO_ENTIDADE: Record<string, string> = {
  auth: 'Acesso',
  clientes: 'Cliente',
  carros: 'Veículo',
  servicos: 'Serviço',
  pecas: 'Peça',
  orcamentos: 'Orçamento',
  ordens: 'Ordem de Serviço',
  agenda: 'Agenda',
  caixa: 'Livro-caixa',
  despesas: 'Despesa',
  'contas-receber': 'Conta a receber',
  compras: 'Compra',
  fornecedores: 'Distribuidor',
  usuarios: 'Usuário',
  backup: 'Cópia de segurança',
};

export async function listLogs(filtros: FiltrosAuditoria) {
  const limite = Math.min(filtros.limite ?? 200, 500);

  const data =
    filtros.de || filtros.ate
      ? {
          ...(filtros.de ? { gte: new Date(`${filtros.de}T00:00:00`) } : {}),
          ...(filtros.ate ? { lte: new Date(`${filtros.ate}T23:59:59`) } : {}),
        }
      : undefined;

  const logs = await prisma.logAuditoria.findMany({
    where: {
      ...(filtros.entidade ? { entidade: filtros.entidade } : {}),
      ...(filtros.usuarioId ? { usuarioId: filtros.usuarioId } : {}),
      ...(data ? { data } : {}),
    },
    orderBy: { data: 'desc' },
    take: limite,
    include: { usuario: { select: { id: true, nome: true, perfil: true } } },
  });

  return logs.map((l) => ({
    id: l.id,
    data: l.data,
    acao: l.acao,
    entidade: l.entidade,
    entidadeId: l.entidadeId,
    detalhes: l.detalhes,
    // Quem fez. Usuário apagado deixa o log em pé — por isso usuarioId é opcional.
    usuario: l.usuario ? { id: l.usuario.id, nome: l.usuario.nome, perfil: l.usuario.perfil } : null,
    descricao: `${ROTULO_ACAO[l.acao] ?? l.acao} · ${ROTULO_ENTIDADE[l.entidade] ?? l.entidade}`,
  }));
}

/** Entidades que já apareceram no log — alimenta o filtro da tela. */
export async function entidadesRegistradas() {
  const linhas = await prisma.logAuditoria.groupBy({ by: ['entidade'], _count: { entidade: true } });
  return linhas
    .map((l) => ({ entidade: l.entidade, rotulo: ROTULO_ENTIDADE[l.entidade] ?? l.entidade, total: l._count.entidade }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}
