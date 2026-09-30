import { describe, expect, it } from 'vitest';
import {
  centavosParaTexto,
  mascaraCpfCnpj,
  mascaraPlaca,
  mascaraTelefone,
  numeroParaTexto,
  textoParaCentavos,
  textoParaNumero,
  valorParaCentavos,
} from '../mascaras';

describe('máscaras', () => {
  it('telefone fixo e celular', () => {
    expect(mascaraTelefone('1133334444')).toBe('(11) 3333-4444');
    expect(mascaraTelefone('11988771234')).toBe('(11) 98877-1234');
    expect(mascaraTelefone('(11) 98877-1234 ramal')).toBe('(11) 98877-1234');
    expect(mascaraTelefone(null)).toBe('');
  });

  it('CPF, CNPJ numérico e CNPJ alfanumérico (2026)', () => {
    expect(mascaraCpfCnpj('12345678901')).toBe('123.456.789-01');
    expect(mascaraCpfCnpj('12345678000199')).toBe('12.345.678/0001-99');
    expect(mascaraCpfCnpj('12abc34501de35')).toBe('12.ABC.345/01DE-35');
  });

  it('placa antiga ganha traço; Mercosul não', () => {
    expect(mascaraPlaca('abc1234')).toBe('ABC-1234');
    expect(mascaraPlaca('abc1d23')).toBe('ABC1D23');
    expect(mascaraPlaca('ABC-1D23')).toBe('ABC1D23');
  });

  it('quantidade fracionada com vírgula', () => {
    expect(textoParaNumero('3,5')).toBe(3.5);
    expect(textoParaNumero('1.250,75')).toBe(1250.75);
    expect(textoParaNumero('')).toBeNull();
    expect(numeroParaTexto(3.5)).toBe('3,5');
    expect(numeroParaTexto(1000)).toBe('1000');
  });

  it('dinheiro digitado vira centavos sem erro de ponto flutuante', () => {
    expect(textoParaCentavos('1.234,56')).toBe(123456);
    expect(valorParaCentavos('0.29')).toBe(29);
    expect(valorParaCentavos('1.005')).toBe(101);
    expect(centavosParaTexto(123456)).toBe('1.234,56');
  });
});
