// ============================================================
// Exportar para planilha (o contador pede, o dono confere no Excel).
//
// Excel em português abre CSV com ";" como separador e vírgula
// decimal; o BOM no começo garante que os acentos saiam certos.
// ============================================================

export interface ColunaCSV<T> {
  titulo: string;
  valor: (linha: T) => string | number | boolean | null | undefined;
}

function celula(v: string | number | boolean | null | undefined): string {
  if (v == null) return '';
  if (typeof v === 'number') return v.toLocaleString('pt-BR', { maximumFractionDigits: 3, useGrouping: false });
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  const texto = String(v);
  return /[;"\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function gerarCSV<T>(colunas: ColunaCSV<T>[], linhas: T[]): string {
  const cabecalho = colunas.map((c) => celula(c.titulo)).join(';');
  const corpo = linhas.map((l) => colunas.map((c) => celula(c.valor(l))).join(';'));
  return [cabecalho, ...corpo].join('\r\n');
}

export function baixarCSV<T>(nomeArquivo: string, colunas: ColunaCSV<T>[], linhas: T[]) {
  const blob = new Blob(['﻿', gerarCSV(colunas, linhas)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo.endsWith('.csv') ? nomeArquivo : `${nomeArquivo}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
