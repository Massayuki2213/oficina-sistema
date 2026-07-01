// ============================================================
// Tipos e constantes compartilhados entre a API e o Desktop.
// Mantém front e back falando a mesma língua (status, perfis...).
// ============================================================

export const PERFIS = ['DONO', 'ATENDENTE', 'MECANICO'] as const;
export type Perfil = (typeof PERFIS)[number];

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

export const STATUS_ORCAMENTO = ['RASCUNHO', 'ENVIADO', 'APROVADO', 'RECUSADO', 'EXPIRADO'] as const;
export type StatusOrcamento = (typeof STATUS_ORCAMENTO)[number];

export const FORMAS_PAGAMENTO = ['A_VISTA', 'PIX', 'CARTAO', 'PARCELADO', 'FIADO'] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

// Rótulos amigáveis para exibir na interface (pt-BR).
export const LABEL_STATUS_OS: Record<StatusOS, string> = {
  ABERTA: 'Aberta',
  EM_EXECUCAO: 'Em execução',
  AGUARDANDO_PECA: 'Aguardando peça',
  AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  CONCLUIDA: 'Concluída',
  ENTREGUE: 'Entregue',
  CANCELADA: 'Cancelada',
};

// Permissões por perfil (base das regras da seção 2 do PLANEJAMENTO.md).
export const PERMISSOES: Record<Perfil, { verFinanceiro: boolean; darDesconto: boolean; apagar: boolean }> = {
  DONO: { verFinanceiro: true, darDesconto: true, apagar: true },
  ATENDENTE: { verFinanceiro: false, darDesconto: true, apagar: false },
  MECANICO: { verFinanceiro: false, darDesconto: false, apagar: false },
};
