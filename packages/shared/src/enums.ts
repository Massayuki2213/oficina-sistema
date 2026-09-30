// ============================================================
// Enums do domínio — espelham os enums do schema.prisma.
// Declarados como arrays `as const` para servirem tanto de tipo
// quanto de lista (ex: preencher <select> na tela).
//
// Os rótulos em pt-BR moram aqui também: é a fonte única do texto
// que o usuário lê, na tela e no documento impresso.
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

/** OS que ainda estão "na oficina" — não foram entregues nem canceladas. */
export const STATUS_OS_ABERTOS: readonly StatusOS[] = [
  'ABERTA',
  'EM_EXECUCAO',
  'AGUARDANDO_PECA',
  'AGUARDANDO_APROVACAO',
  'CONCLUIDA',
];

/**
 * Fluxo de trabalho da OS: para onde cada status pode ir. A tela usa para
 * mostrar só os botões possíveis; o servidor, para recusar o resto.
 * CANCELADA tem rota própria (pede motivo e devolve as peças).
 */
export const TRANSICOES_OS: Record<StatusOS, readonly StatusOS[]> = {
  ABERTA: ['EM_EXECUCAO', 'AGUARDANDO_PECA', 'AGUARDANDO_APROVACAO'],
  AGUARDANDO_PECA: ['EM_EXECUCAO', 'AGUARDANDO_APROVACAO'],
  AGUARDANDO_APROVACAO: ['EM_EXECUCAO', 'AGUARDANDO_PECA'],
  EM_EXECUCAO: ['AGUARDANDO_PECA', 'AGUARDANDO_APROVACAO', 'CONCLUIDA'],
  CONCLUIDA: ['EM_EXECUCAO', 'ENTREGUE'],
  ENTREGUE: [],
  CANCELADA: [],
};

/** O mecânico movimenta a oficina, mas não entrega o carro (a entrega passa pelo caixa). */
export const STATUS_DO_MECANICO: readonly StatusOS[] = ['EM_EXECUCAO', 'AGUARDANDO_PECA', 'AGUARDANDO_APROVACAO', 'CONCLUIDA'];

export const TIPOS_VISITA = ['REVISAO', 'RETORNO', 'ORCAMENTO', 'GARANTIA'] as const;
export type TipoVisita = (typeof TIPOS_VISITA)[number];

export const STATUS_VISITA = ['AGENDADA', 'CONFIRMADA', 'REALIZADA', 'FALTOU'] as const;
export type StatusVisita = (typeof STATUS_VISITA)[number];

export const TIPOS_LANCAMENTO = ['ENTRADA', 'SAIDA'] as const;
export type TipoLancamento = (typeof TIPOS_LANCAMENTO)[number];

/**
 * De onde veio o lançamento. Importa para o relatório de lucro:
 * APORTE (dinheiro que o dono colocou) não é faturamento, e RETIRADA
 * (dinheiro que o dono tirou) não é despesa da oficina.
 */
export const ORIGENS_LANCAMENTO = ['OS', 'VENDA_BALCAO', 'DESPESA', 'APORTE', 'RETIRADA', 'ESTORNO'] as const;
export type OrigemLancamento = (typeof ORIGENS_LANCAMENTO)[number];

export const FORMAS_PAGAMENTO = [
  'A_VISTA',
  'PIX',
  'CARTAO',
  'TRANSFERENCIA',
  'PARCELADO',
  'FIADO',
  'MISTO',
] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

/** Entra no caixa na hora. */
export const FORMAS_A_VISTA = ['A_VISTA', 'PIX', 'CARTAO'] as const;
export type FormaAVista = (typeof FORMAS_A_VISTA)[number];

/** Vira parcela em Contas a Receber; entra no caixa quando cada uma for paga. */
export const FORMAS_A_PRAZO = ['PARCELADO', 'FIADO'] as const;
export type FormaAPrazo = (typeof FORMAS_A_PRAZO)[number];

/** Como a oficina paga uma conta (despesa, distribuidor, retirada). */
export const FORMAS_SAIDA = ['A_VISTA', 'PIX', 'CARTAO', 'TRANSFERENCIA'] as const;
export type FormaSaida = (typeof FORMAS_SAIDA)[number];

export const TIPOS_MOVIMENTO_ESTOQUE = ['ENTRADA', 'SAIDA', 'AJUSTE'] as const;
export type TipoMovimentoEstoque = (typeof TIPOS_MOVIMENTO_ESTOQUE)[number];

export const STATUS_PARCELA = ['PENDENTE', 'PAGA', 'CANCELADA'] as const;
export type StatusParcela = (typeof STATUS_PARCELA)[number];

export const STATUS_COMPRA = ['PENDENTE', 'PAGA'] as const;
export type StatusCompra = (typeof STATUS_COMPRA)[number];

// ------------------------------------------------------------
// Rótulos (pt-BR)
// ------------------------------------------------------------

export const LABEL_PERFIL: Record<Perfil, string> = {
  DONO: 'Dono',
  ATENDENTE: 'Atendente',
  MECANICO: 'Mecânico',
};

export const DESCRICAO_PERFIL: Record<Perfil, string> = {
  DONO: 'Vê o financeiro e administra o sistema',
  ATENDENTE: 'Atende, orça, abre OS e recebe — sem financeiro',
  MECANICO: 'Executa as OS dele, aponta serviço e lança peça',
};

export const LABEL_TIPO_PESSOA: Record<TipoPessoa, string> = {
  PF: 'Pessoa Física',
  PJ: 'Pessoa Jurídica',
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
  A_VISTA: 'Dinheiro',
  PIX: 'PIX',
  CARTAO: 'Cartão',
  TRANSFERENCIA: 'Boleto / transferência',
  PARCELADO: 'Parcelado',
  FIADO: 'Fiado',
  MISTO: 'Misto',
};

export const LABEL_TIPO_VISITA: Record<TipoVisita, string> = {
  REVISAO: 'Revisão',
  RETORNO: 'Retorno',
  ORCAMENTO: 'Orçamento',
  GARANTIA: 'Garantia',
};

export const LABEL_STATUS_VISITA: Record<StatusVisita, string> = {
  AGENDADA: 'Agendada',
  CONFIRMADA: 'Confirmada',
  REALIZADA: 'Realizada',
  FALTOU: 'Faltou',
};

export const LABEL_ORIGEM_LANCAMENTO: Record<OrigemLancamento, string> = {
  OS: 'Ordem de Serviço',
  VENDA_BALCAO: 'Venda no balcão',
  DESPESA: 'Despesa',
  APORTE: 'Aporte',
  RETIRADA: 'Retirada',
  ESTORNO: 'Estorno',
};

export const LABEL_TIPO_ITEM_ESTOQUE: Record<TipoItemEstoque, string> = {
  PECA: 'Peça',
  PRODUTO: 'Produto',
};

export const LABEL_TIPO_MOVIMENTO: Record<TipoMovimentoEstoque, string> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  AJUSTE: 'Ajuste de inventário',
};

export const LABEL_STATUS_PARCELA: Record<StatusParcela, string> = {
  PENDENTE: 'Pendente',
  PAGA: 'Recebida',
  CANCELADA: 'Cancelada',
};

export const LABEL_STATUS_COMPRA: Record<StatusCompra, string> = {
  PENDENTE: 'Em aberto',
  PAGA: 'Paga',
};
