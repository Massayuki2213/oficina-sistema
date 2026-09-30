import { normalizarDocumento, paraCentavos, soDigitos } from '@hermes/shared';

// ============================================================
// Máscaras — o balconista digita só os números e a formatação
// aparece sozinha. O servidor guarda tudo "limpo" (só dígitos,
// placa sem traço); estas funções servem para digitar E para
// mostrar o que veio do banco.
// ============================================================

export { soDigitos };

/** (11) 98877-1234 — fixo (10 dígitos) ou celular (11). */
export function mascaraTelefone(v: string | null | undefined) {
  const d = soDigitos(v ?? '').slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * 123.456.789-01 (CPF) ou 12.345.678/0001-99 (CNPJ). Aceita o CNPJ
 * alfanumérico (letras nas 12 primeiras posições, desde jul/2026):
 * se aparecer letra, ou passar de 11 caracteres, é CNPJ.
 */
export function mascaraCpfCnpj(v: string | null | undefined) {
  const c = normalizarDocumento(v ?? '').slice(0, 14);
  if (!c) return '';
  const ehCpf = c.length <= 11 && /^\d+$/.test(c);

  if (ehCpf) {
    let s = c.slice(0, 3);
    if (c.length > 3) s += `.${c.slice(3, 6)}`;
    if (c.length > 6) s += `.${c.slice(6, 9)}`;
    if (c.length > 9) s += `-${c.slice(9, 11)}`;
    return s;
  }

  let s = c.slice(0, 2);
  if (c.length > 2) s += `.${c.slice(2, 5)}`;
  if (c.length > 5) s += `.${c.slice(5, 8)}`;
  if (c.length > 8) s += `/${c.slice(8, 12)}`;
  if (c.length > 12) s += `-${c.slice(12, 14)}`;
  return s;
}

/**
 * ABC-1234 (modelo antigo) ou ABC1D23 (Mercosul, sem traço).
 * O traço some sozinho quando a 5ª posição é letra — aí é placa Mercosul.
 */
export function mascaraPlaca(v: string | null | undefined) {
  const c = (v ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 7);
  if (c.length <= 3 || /^[A-Z]{3}\d[A-Z]/.test(c)) return c;
  return `${c.slice(0, 3)}-${c.slice(3)}`;
}

// ---- Dinheiro e quantidade --------------------------------------------------
// O formulário guarda o valor como a API espera ("1234.56"); a tela mostra
// no jeito brasileiro ("1.234,56").

export const centavosParaTexto = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** O que foi digitado ("1.234,56" ou "123456") vira centavos. */
export const textoParaCentavos = (v: string) => Number(soDigitos(v) || 0);

/** "1234.56" (valor do formulário) vira centavos — mesmo arredondamento do servidor. */
export const valorParaCentavos = (v: string) => (v ? paraCentavos(v) : 0);

/** Texto do formulário ("3,5") vira número (3.5); vazio vira null. */
export function textoParaNumero(v: string): number | null {
  const limpo = v.trim().replace(/\./g, '').replace(',', '.');
  if (limpo === '') return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** Número para o campo de texto: 3.5 → "3,5". */
export const numeroParaTexto = (n: number | null | undefined) =>
  n == null ? '' : n.toLocaleString('pt-BR', { maximumFractionDigits: 3, useGrouping: false });
