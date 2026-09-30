// ============================================================
// Formato de erro da API e os códigos que a tela trata.
//
// A tela reage ao CÓDIGO, nunca ao texto nem só ao status HTTP:
// o 409 do conflito de agenda e o 409 do fiado bloqueado pedem
// perguntas diferentes ao usuário. Texto muda; código não.
// ============================================================

export const CODIGOS_ERRO = {
  VALIDACAO: 'VALIDACAO',
  NAO_AUTENTICADO: 'NAO_AUTENTICADO',
  SEM_PERMISSAO: 'SEM_PERMISSAO',
  NAO_ENCONTRADO: 'NAO_ENCONTRADO',
  CONFLITO: 'CONFLITO',
  MUITAS_TENTATIVAS: 'MUITAS_TENTATIVAS',
  /** RN-08: desconto acima do teto — peça a senha do Dono e reenvie. */
  SENHA_DONO_NECESSARIA: 'SENHA_DONO_NECESSARIA',
  SENHA_DONO_INCORRETA: 'SENHA_DONO_INCORRETA',
  /** Orçamento rápido virando OS sem cliente/veículo. */
  CADASTRO_NECESSARIO: 'CADASTRO_NECESSARIO',
  /** RN-03: falta peça — confirme a encomenda (confirmarSemEstoque) e reenvie. */
  ESTOQUE_INSUFICIENTE: 'ESTOQUE_INSUFICIENTE',
  /** RN-19: já há agendamento no horário — confirme o encaixe (ignorarConflito). */
  CONFLITO_AGENDA: 'CONFLITO_AGENDA',
  /** RN-11.2: cliente com parcela vencida — confirme liberar o fiado (liberarFiado). */
  FIADO_BLOQUEADO: 'FIADO_BLOQUEADO',
  /** Primeiro acesso já foi feito. */
  JA_CONFIGURADO: 'JA_CONFIGURADO',
  /**
   * Concorrência otimista (ADR 0010): alguém salvou este registro depois que a
   * tela o carregou. Nada foi gravado; recarregue e refaça a alteração.
   * `detalhes`: { por: nome de quem salvou | null, em: ISODate | null }.
   */
  CONFLITO_EDICAO: 'CONFLITO_EDICAO',
  /** Idempotência (ADR 0011): a mesma operação ainda está sendo processada — espere e repita. */
  OPERACAO_EM_ANDAMENTO: 'OPERACAO_EM_ANDAMENTO',
  /** Idempotência: a chave já foi usada numa operação diferente (outra rota ou outro corpo). */
  CHAVE_REUTILIZADA: 'CHAVE_REUTILIZADA',
} as const;

export type CodigoErro = (typeof CODIGOS_ERRO)[keyof typeof CODIGOS_ERRO];

/** Corpo de toda resposta de erro da API. */
export interface ErroApi {
  message: string;
  codigo?: CodigoErro;
  /** Erros por campo do formulário: { "nome": ["Informe o nome"] }. */
  erros?: Record<string, string[]>;
  /** Dados extras do caso (ex.: quais peças faltam no estoque). */
  detalhes?: unknown;
}
