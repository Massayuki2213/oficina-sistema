// ============================================================
// @hermes/shared — contrato compartilhado entre a API e a tela:
// enums e rótulos, permissões, formatos de resposta (DTOs), códigos
// de erro e as regras puras que precisam dar o mesmo resultado nos
// dois lados (dinheiro, CPF/CNPJ, placa).
//
// Os schemas de validação (Zod) ficam em "@hermes/shared/schemas".
// ============================================================

export * from './enums.js';
export * from './permissions.js';
export * from './dtos.js';
export * from './erros.js';
export * from './dinheiro.js';
export * from './validacao.js';

/** Versão do produto — a API informa no /api/health e a tela mostra no rodapé. */
export const VERSAO = '1.0.0';
