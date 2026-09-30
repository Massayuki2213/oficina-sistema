import { afterEach, describe, expect, it, vi } from 'vitest';
import { dataBR, paraData, paraDataISO, relativo, somarMeses } from '../format';

describe('datas', () => {
  afterEach(() => vi.useRealTimers());

  it('data sem hora é o dia local — não volta um dia pelo fuso', () => {
    const d = paraData('2026-09-29');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 8, 29, 0]);
    expect(dataBR('2026-09-29')).toBe('29/09/26');
  });

  it('vencimento mensal: dia que não existe cai no último do mês (igual ao servidor)', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29');
    expect(somarMeses('2026-01-31', 2)).toBe('2026-03-31');
    expect(somarMeses('2026-11-15', 3)).toBe('2027-02-15');
  });

  it('relativo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 15, 0));
    expect(relativo('2026-09-29')).toBe('hoje');
    expect(relativo('2026-09-30')).toBe('amanhã');
    expect(relativo('2026-09-26')).toBe('há 3 dias');
    expect(paraDataISO(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
