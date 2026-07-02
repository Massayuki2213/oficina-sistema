// ============================================================
// Enums do domínio — espelham os enums do schema.prisma.
// Declarados como arrays `as const` para servirem tanto de tipo
// quanto de lista (ex: preencher <select> no front).
// ============================================================

export const PERFIS = ['DONO', 'ATENDENTE', 'MECANICO'] as const;
export type Perfil = (typeof PERFIS)[number];

export const TIPOS_PESSOA = ['PF', 'PJ'] as const;
export type TipoPessoa = (typeof TIPOS_PESSOA)[number];

export const TIPOS_ITEM_ESTOQUE = ['PECA', 'PRODUTO'] as const;
export type TipoItemEstoque = (typeof TIPOS_ITEM_ESTOQUE)[number];

export const STATUS_ORCAMENTO = ['RASCUNHO', 'ENVIADO', 'APROVADO', 'RECUSADO', 'EXPIRADO'] as const;
export type StatusOrcamento = (typeof STATUS_ORCAMENTO)[number];

export const STATUS_OS = [
  'ABERTA',
  'EM_EXECUCAO',
  'AGUARDANDO_PECA',
  'AGUARDANDO_APROVACAO',
  'CONCLUIDA',
  'ENTREGUE',
  'CANCELADA',
] as const;
export type StatusOS = (typeof STATUS_OS)[number];

export const TIPOS_VISITA = ['REVISAO', 'RETORNO', 'ORCAMENTO', 'GARANTIA'] as const;
export type TipoVisita = (typeof TIPOS_VISITA)[number];

export const STATUS_VISITA = ['AGENDADA', 'CONFIRMADA', 'REALIZADA', 'FALTOU'] as const;
export type StatusVisita = (typeof STATUS_VISITA)[number];

export const TIPOS_LANCAMENTO = ['ENTRADA', 'SAIDA'] as const;
export type TipoLancamento = (typeof TIPOS_LANCAMENTO)[number];

export const ORIGENS_LANCAMENTO = ['OS', 'VENDA_BALCAO', 'DESPESA', 'APORTE'] as const;
export type OrigemLancamento = (typeof ORIGENS_LANCAMENTO)[number];

export const FORMAS_PAGAMENTO = ['A_VISTA', 'PIX', 'CARTAO', 'PARCELADO', 'FIADO'] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

export const TIPOS_MOVIMENTO_ESTOQUE = ['ENTRADA', 'SAIDA', 'AJUSTE'] as const;
export type TipoMovimentoEstoque = (typeof TIPOS_MOVIMENTO_ESTOQUE)[number];

export const STATUS_PARCELA = ['PENDENTE', 'PAGA', 'ATRASADA'] as const;
export type StatusParcela = (typeof STATUS_PARCELA)[number];

// ------------------------------------------------------------
// Rótulos amigáveis (pt-BR) para exibir na interface.
// ------------------------------------------------------------

export const LABEL_PERFIL: Record<Perfil, string> = {
  DONO: 'Dono / Administrador',
  ATENDENTE: 'Atendente / Recepção',
  MECANICO: 'Mecânico',
};

export const LABEL_STATUS_OS: Record<StatusOS, string> = {
  ABERTA: 'Aberta',
  EM_EXECUCAO: 'Em execução',
  AGUARDANDO_PECA: 'Aguardando peça',
  AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  CONCLUIDA: 'Concluída',
  ENTREGUE: 'Entregue',
  CANCELADA: 'Cancelada',
};

export const LABEL_STATUS_ORCAMENTO: Record<StatusOrcamento, string> = {
  RASCUNHO: 'Rascunho',
  ENVIADO: 'Enviado',
  APROVADO: 'Aprovado',
  RECUSADO: 'Recusado',
  EXPIRADO: 'Expirado',
};

export const LABEL_FORMA_PAGAMENTO: Record<FormaPagamento, string> = {
  A_VISTA: 'À vista',
  PIX: 'PIX',
  CARTAO: 'Cartão',
  PARCELADO: 'Parcelado',
  FIADO: 'Fiado',
};
