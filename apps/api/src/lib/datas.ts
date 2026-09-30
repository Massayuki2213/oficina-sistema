// ============================================================
// Datas no fuso da oficina.
//
// O env.ts aplica TZ (padrão America/Sao_Paulo) no processo, então
// as funções "locais" do Date já falam o horário da oficina. Isso
// importa na nuvem: lá o relógio do servidor é UTC, e o "caixa de
// hoje" calculado em UTC fecharia às 21h de Brasília.
// ============================================================

const DIA_MS = 24 * 60 * 60 * 1000;

/** "2026-09-29" → Date no horário local indicado (padrão: meio-dia). */
export function dataLocal(dataISO: string, hora = 12, minuto = 0): Date {
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  return new Date(ano, mes - 1, dia, hora, minuto, 0, 0);
}

/** Date → "2026-09-29" no fuso da oficina. */
export function paraDataISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const hojeISO = () => paraDataISO(new Date());

export function inicioDoDia(d: Date | string = new Date()): Date {
  const base = typeof d === 'string' ? dataLocal(d) : new Date(d);
  base.setHours(0, 0, 0, 0);
  return base;
}

export function fimDoDia(d: Date | string = new Date()): Date {
  const base = typeof d === 'string' ? dataLocal(d) : new Date(d);
  base.setHours(23, 59, 59, 999);
  return base;
}

/** Período inclusivo para filtro do Prisma. Sem limites → undefined (sem filtro). */
export function intervalo(de?: string | null, ate?: string | null): { gte?: Date; lte?: Date } | undefined {
  if (!de && !ate) return undefined;
  return { ...(de ? { gte: inicioDoDia(de) } : {}), ...(ate ? { lte: fimDoDia(ate) } : {}) };
}

export const adicionarDias = (d: Date, dias: number) => new Date(d.getTime() + dias * DIA_MS);

/**
 * Mesmo dia do mês, N meses depois — é assim que vence parcela.
 * 31/jan + 1 mês = 28 (ou 29)/fev: o dia é limitado ao fim do mês.
 */
export function adicionarMeses(d: Date, meses: number): Date {
  const alvo = new Date(d.getFullYear(), d.getMonth() + meses, 1, d.getHours(), d.getMinutes(), d.getSeconds());
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(d.getDate(), ultimoDia));
  return alvo;
}

/** Dias inteiros de b até a (a − b), pelo calendário local. */
export function diasEntre(a: Date, b: Date): number {
  return Math.round((inicioDoDia(a).getTime() - inicioDoDia(b).getTime()) / DIA_MS);
}

/** "2026-09" do mês da data. */
export const mesISO = (d: Date) => paraDataISO(d).slice(0, 7);

export const iso = (d: Date) => d.toISOString();
export const isoOuNull = (d: Date | null | undefined) => (d ? d.toISOString() : null);
