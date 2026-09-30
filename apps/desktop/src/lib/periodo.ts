import { paraDataISO } from './format';

// Presets de período das telas financeiras (Caixa, Despesas, Compras, Relatórios).
export type PeriodoKey = 'hoje' | 'semana' | 'mes' | 'mesPassado' | 'ano' | 'tudo';

export const PERIODOS: { key: PeriodoKey; label: string }[] = [
  { key: 'hoje', label: 'Hoje' },
  { key: 'semana', label: '7 dias' },
  { key: 'mes', label: 'Este mês' },
  { key: 'mesPassado', label: 'Mês passado' },
  { key: 'ano', label: 'Este ano' },
  { key: 'tudo', label: 'Tudo' },
];

export function rangeDe(key: PeriodoKey): { de?: string; ate?: string } {
  const hoje = new Date();
  const ate = paraDataISO(hoje);
  switch (key) {
    case 'tudo':
      return {};
    case 'hoje':
      return { de: ate, ate };
    case 'semana': {
      const d = new Date(hoje);
      d.setDate(d.getDate() - 6);
      return { de: paraDataISO(d), ate };
    }
    case 'mesPassado':
      return {
        de: paraDataISO(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)),
        ate: paraDataISO(new Date(hoje.getFullYear(), hoje.getMonth(), 0)),
      };
    case 'ano':
      return { de: paraDataISO(new Date(hoje.getFullYear(), 0, 1)), ate };
    default:
      return { de: paraDataISO(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate };
  }
}

export const rotuloPeriodo = (key: PeriodoKey) => PERIODOS.find((p) => p.key === key)?.label ?? '';
