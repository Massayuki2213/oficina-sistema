// ============================================================
// Máscaras dos campos (Fase 5) — o balconista digita só os números,
// a formatação aparece sozinha. A API normaliza o que recebe, então
// mandar "ABC-1234" ou "(11) 98877-1234" é seguro.
// ============================================================

export const soDigitos = (v: string) => v.replace(/\D/g, '');

/** (11) 98877-1234 — aceita fixo (10 dígitos) e celular (11). */
export function mascaraTelefone(v: string) {
  const d = soDigitos(v).slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** 123.456.789-01 (CPF) ou 12.345.678/0001-99 (CNPJ) — decide pelo tamanho. */
export function mascaraCpfCnpj(v: string) {
  const d = soDigitos(v).slice(0, 14);
  if (!d) return '';

  if (d.length <= 11) {
    let s = d.slice(0, 3);
    if (d.length > 3) s += `.${d.slice(3, 6)}`;
    if (d.length > 6) s += `.${d.slice(6, 9)}`;
    if (d.length > 9) s += `-${d.slice(9, 11)}`;
    return s;
  }

  let s = d.slice(0, 2);
  if (d.length > 2) s += `.${d.slice(2, 5)}`;
  if (d.length > 5) s += `.${d.slice(5, 8)}`;
  if (d.length > 8) s += `/${d.slice(8, 12)}`;
  if (d.length > 12) s += `-${d.slice(12, 14)}`;
  return s;
}

/**
 * ABC-1234 (modelo antigo) ou ABC1D23 (Mercosul, sem traço).
 * O traço some sozinho quando a 5ª posição é letra — aí é placa Mercosul.
 */
export function mascaraPlaca(v: string) {
  const c = v
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 7);
  if (c.length <= 3 || /^[A-Z]{3}\d[A-Z]/.test(c)) return c;
  return `${c.slice(0, 3)}-${c.slice(3)}`;
}

// ---- Dinheiro -------------------------------------------------------------
// O formulário guarda o valor como a API espera ("1234.56"); a tela mostra
// no jeito brasileiro ("1.234,56"). O usuário digita só dígitos.

export const centavosParaTexto = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** O que foi digitado ("1.234,56" ou "123456") vira centavos. */
export const textoParaCentavos = (v: string) => Number(soDigitos(v) || 0);

/** "1234.56" (valor do formulário) vira centavos. */
export const valorParaCentavos = (v: string) => (v ? Math.round(Number(v) * 100) : 0);
