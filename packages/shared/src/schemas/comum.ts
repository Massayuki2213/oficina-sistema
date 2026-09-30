import { z } from 'zod';
import { arredondar, arredondarQtd } from '../dinheiro.js';
import {
  documentoValido,
  normalizarDocumento,
  normalizarPlaca,
  normalizarTelefone,
  placaValida,
  telefoneValido,
} from '../validacao.js';

// ============================================================
// Peças de schema reutilizadas por todos os módulos.
//
// Convenções do contrato (API ⇄ tela):
//  - o corpo usa tipos JSON de verdade: número é number, vazio é null;
//  - texto opcional vazio ('') vira null — é assim que a EDIÇÃO apaga
//    um campo (undefined deixaria o valor antigo no banco);
//  - dinheiro chega em reais e sai arredondado ao centavo;
//  - quantidade de peça aceita fração (3,5 L), até 3 casas.
// ============================================================

const vazioParaNull = (v: string) => (v === '' ? null : v);

/** Texto obrigatório, aparado nas pontas. */
export const texto = (mensagem: string, max = 200, min = 1) =>
  z
    .string({ error: mensagem })
    .trim()
    .min(min, mensagem)
    .max(max, `Use no máximo ${max} caracteres`);

/** Texto opcional: '' vira null. */
export const textoOpcional = (max = 500) =>
  z.string().trim().max(max, `Use no máximo ${max} caracteres`).transform(vazioParaNull).nullable().optional();

/** Id obrigatório (cuid). */
export const id = (mensagem = 'Identificador ausente') => z.string({ error: mensagem }).trim().min(1, mensagem);

/** Id opcional vindo de um <select>: '' vira null. */
export const idOpcional = z.string().trim().transform(vazioParaNull).nullable().optional();

/** CPF ou CNPJ (inclusive alfanumérico), guardado sem pontuação. */
export const documentoOpcional = z
  .string()
  .transform(normalizarDocumento)
  .refine((v) => v === '' || documentoValido(v), 'CPF ou CNPJ inválido — confira os números')
  .transform(vazioParaNull)
  .nullable()
  .optional();

/** Telefone guardado só com dígitos (DDD + número). */
export const telefoneOpcional = z
  .string()
  .transform(normalizarTelefone)
  .refine((v) => v === '' || telefoneValido(v), 'Telefone inválido — informe DDD + número')
  .transform(vazioParaNull)
  .nullable()
  .optional();

const emailValido = (v: string) => z.email().safeParse(v).success;

export const emailObrigatorio = z
  .string({ error: 'Informe o e-mail' })
  .trim()
  .toLowerCase()
  .refine(emailValido, 'E-mail inválido');

export const emailOpcional = z
  .string()
  .trim()
  .toLowerCase()
  .refine((v) => v === '' || emailValido(v), 'E-mail inválido')
  .transform(vazioParaNull)
  .nullable()
  .optional();

/** Placa guardada sem traço, em maiúsculas. */
export const placa = z
  .string({ error: 'Informe a placa' })
  .transform(normalizarPlaca)
  .refine(placaValida, 'Placa inválida — use o formato ABC1234 ou ABC1D23');

/** Valor em reais, ≥ 0, arredondado ao centavo. */
export const dinheiro = (mensagem = 'Informe o valor') =>
  z
    .number({ error: mensagem })
    .min(0, 'O valor não pode ser negativo')
    .max(10_000_000, 'Valor alto demais')
    .transform(arredondar);

/** Valor em reais, > 0. */
export const dinheiroPositivo = (mensagem = 'Informe o valor') =>
  z
    .number({ error: mensagem })
    .max(10_000_000, 'Valor alto demais')
    .transform(arredondar)
    .refine((v) => v > 0, 'O valor precisa ser maior que zero');

/** Quantidade de peça: fracionada, até 3 casas. */
export const quantidadePeca = z
  .number({ error: 'Informe a quantidade' })
  .max(99_999, 'Quantidade alta demais')
  .transform(arredondarQtd)
  .refine((q) => q > 0, 'A quantidade precisa ser maior que zero');

/** Estoque (contagem): ≥ 0, fracionado. */
export const quantidadeEstoque = z
  .number({ error: 'Informe a quantidade' })
  .min(0, 'A quantidade não pode ser negativa')
  .max(99_999, 'Quantidade alta demais')
  .transform(arredondarQtd);

/** Quantidade de serviço: inteira. */
export const quantidadeServico = z
  .number({ error: 'Informe a quantidade' })
  .int('Use um número inteiro')
  .min(1, 'A quantidade mínima é 1')
  .max(999, 'Quantidade alta demais');

/** KM do veículo. */
export const kmOpcional = z
  .number()
  .int('KM sem casas decimais')
  .min(0, 'KM inválido')
  .max(9_999_999, 'KM alto demais')
  .nullable()
  .optional();

const ehDataISO = (v: string) => z.iso.date().safeParse(v).success;

/** Data sem hora: "2026-09-29". */
export const dataISO = z.string({ error: 'Informe a data' }).refine(ehDataISO, 'Data inválida');

/** Data opcional: '' vira null. */
export const dataISOOpcional = z
  .string()
  .refine((v) => v === '' || ehDataISO(v), 'Data inválida')
  .transform(vazioParaNull)
  .nullable()
  .optional();

const ehDataHora = (v: string) => !Number.isNaN(Date.parse(v));

/** Data e hora em ISO 8601 (a tela manda com fuso: new Date(...).toISOString()). */
export const dataHora = z.string({ error: 'Informe a data e a hora' }).refine(ehDataHora, 'Data/hora inválida');

export const dataHoraOpcional = z
  .string()
  .refine((v) => v === '' || ehDataHora(v), 'Data/hora inválida')
  .transform(vazioParaNull)
  .nullable()
  .optional();

/** Senha do Dono para autorizar desconto acima do teto (RN-08). Nunca é gravada. */
export const senhaDono = z.string().max(200).optional();

/**
 * Concorrência otimista (ADR 0010): a versão do registro que a tela carregou.
 * Na edição, a API só grava se ninguém salvou depois disso — senão responde
 * CONFLITO_EDICAO dizendo quem salvou. Sem ela (integrações), grava direto.
 */
export const versao = z.number().int().min(0).optional();

// ---- Query string ----------------------------------------------------------

export const paginacaoQuery = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(25),
  busca: z.string().trim().max(100).optional(),
});
export type PaginacaoQuery = z.infer<typeof paginacaoQuery>;

export const periodoQuery = z.object({
  de: dataISO.optional(),
  ate: dataISO.optional(),
});

export const idParams = z.object({ id: id() });

/** "true"/"false"/"1"/"0" na query string. (z.coerce.boolean trataria "false" como true.) */
export const booleanoQuery = z.stringbool().optional();
