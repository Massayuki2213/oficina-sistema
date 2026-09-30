import { describe, it, expect } from 'vitest';
import {
  documentoValido,
  normalizarDocumento,
  normalizarPlaca,
  placaValida,
  telefoneValido,
  normalizarTelefone,
} from '../src/validacao.js';
import { arredondar, dividirEmParcelas, multiplicar, paraCentavos, somar, subtrair, somarQtd, brl, formatarQtd } from '../src/dinheiro.js';

describe('CPF e CNPJ', () => {
  it.each([
    ['529.982.247-25', true],
    ['52998224725', true],
    ['529.982.247-24', false], // dígito errado
    ['111.111.111-11', false], // repetido passa na conta, mas não existe
    ['123', false],
  ])('CPF %s → %s', (doc, ok) => {
    expect(documentoValido(normalizarDocumento(doc))).toBe(ok);
  });

  it.each([
    ['11.222.333/0001-81', true],
    ['11222333000181', true],
    ['11.222.333/0001-82', false],
    ['00.000.000/0000-00', false],
  ])('CNPJ numérico %s → %s', (doc, ok) => {
    expect(documentoValido(normalizarDocumento(doc))).toBe(ok);
  });

  // Exemplo oficial da Receita para o CNPJ alfanumérico (vigente desde jul/2026).
  it('aceita o CNPJ alfanumérico', () => {
    expect(normalizarDocumento('12.abc.345/01de-35')).toBe('12ABC34501DE35');
    expect(documentoValido('12ABC34501DE35')).toBe(true);
    expect(documentoValido('12ABC34501DE36')).toBe(false);
  });
});

describe('placa e telefone', () => {
  it.each([
    ['abc-1234', 'ABC1234', true],
    ['ABC1D23', 'ABC1D23', true],
    ['AB1234', 'AB1234', false],
    ['ABCD123', 'ABCD123', false],
  ])('%s → %s (%s)', (entrada, normal, ok) => {
    expect(normalizarPlaca(entrada)).toBe(normal);
    expect(placaValida(normalizarPlaca(entrada))).toBe(ok);
  });

  it('telefone vira só dígitos e precisa de DDD', () => {
    expect(normalizarTelefone('(11) 98877-1234')).toBe('11988771234');
    expect(telefoneValido('11988771234')).toBe(true);
    expect(telefoneValido('1133334444')).toBe(true);
    expect(telefoneValido('988771234')).toBe(false);
  });
});

describe('dinheiro em centavos', () => {
  it('0,1 + 0,2 é 0,3', () => {
    expect(somar(0.1, 0.2)).toBe(0.3);
  });

  it('arredondamento comercial não tropeça no ponto flutuante', () => {
    expect(paraCentavos(1.005)).toBe(101);
    expect(arredondar(2.675)).toBe(2.68);
    expect(paraCentavos('38.00')).toBe(3800);
  });

  it('preço × quantidade fracionada fecha no centavo', () => {
    expect(multiplicar(38, 3.5)).toBe(133);
    expect(multiplicar(19.9, 3)).toBe(59.7);
    expect(subtrair(200, 30)).toBe(170);
  });

  it('parcelas somam exatamente o total — o resto vai na última', () => {
    const p = dividirEmParcelas(100, 3);
    expect(p).toEqual([33.33, 33.33, 33.34]);
    expect(somar(...p)).toBe(100);
    expect(dividirEmParcelas(0.05, 2)).toEqual([0.02, 0.03]);
  });

  it('quantidade soma sem erro de ponto flutuante', () => {
    expect(somarQtd(10, -3.5, -2.25)).toBe(4.25);
    expect(somarQtd(0.1, 0.2)).toBe(0.3);
  });

  it('formata em reais e quantidade no padrão brasileiro', () => {
    expect(brl(1234.5).replace(/\s/g, ' ')).toBe('R$ 1.234,50');
    expect(formatarQtd(3.5, 'L')).toBe('3,5 L');
  });
});
