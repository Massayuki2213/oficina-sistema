// Presets de período usados pelas telas financeiras (Caixa, Despesas, Relatórios).
export type PeriodoKey = 'hoje' | 'semana' | 'mes' | 'tudo';

export const PERIODOS: { key: PeriodoKey; label: string }[] = [
  { key: 'hoje', label: 'Hoje' },
  { key: 'semana', label: '7 dias' },
  { key: 'mes', label: 'Este mês' },
  { key: 'tudo', label: 'Tudo' },
];

// Formata em AAAA-MM-DD usando a data LOCAL (evita o pulo de dia do toISOString em UTC).
function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

export function rangeDe(key: PeriodoKey): { de?: string; ate?: string } {
  const hoje = new Date();
  const ate = ymd(hoje);
  if (key === 'tudo') return {};
  if (key === 'hoje') return { de: ate, ate };
  if (key === 'semana') {
    const d = new Date(hoje);
    d.setDate(d.getDate() - 6);
    return { de: ymd(d), ate };
  }
  // mes: do dia 1º até hoje
  return { de: ymd(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate };
}

// Monta a querystring ?de=&ate= (vazia quando o período é "tudo").
export function queryPeriodo(key: PeriodoKey): string {
  const { de, ate } = rangeDe(key);
  const p = new URLSearchParams();
  if (de) p.set('de', de);
  if (ate) p.set('ate', ate);
  const s = p.toString();
  return s ? `?${s}` : '';
}
