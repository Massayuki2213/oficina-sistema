import { CODIGOS_ERRO, type CodigoErro } from '@hermes/shared';

// ============================================================
// Erro de regra de negócio com status HTTP. O tratador global
// (plugins/erros.ts) converte em { message, codigo?, detalhes? },
// deixando os services livres de detalhes de HTTP.
// ============================================================

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public codigo?: CodigoErro,
    public detalhes?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const COD = CODIGOS_ERRO;

// Atalhos para os casos mais comuns — leem como a regra que expressam.

/** Ex.: naoEncontrado('Cliente não encontrado'). */
export const naoEncontrado = (mensagem: string) => new AppError(404, mensagem, COD.NAO_ENCONTRADO);

export const conflito = (mensagem: string, codigo: CodigoErro = COD.CONFLITO, detalhes?: unknown) =>
  new AppError(409, mensagem, codigo, detalhes);

export const invalido = (mensagem: string, codigo: CodigoErro = COD.VALIDACAO, detalhes?: unknown) =>
  new AppError(400, mensagem, codigo, detalhes);

export const semPermissao = (mensagem = 'Você não tem permissão para esta ação.') =>
  new AppError(403, mensagem, COD.SEM_PERMISSAO);
