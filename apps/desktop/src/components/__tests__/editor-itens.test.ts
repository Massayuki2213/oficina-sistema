import { describe, expect, it } from 'vitest';
import { calcularTotais, itensInvalidos, itensParaEnvio, type Itens } from '../EditorItens';

const itens: Itens = {
  servicos: [{ servicoId: 's1', nome: 'Troca de óleo', quantidade: '1', precoUnit: '80.00', precoCatalogo: 80 }],
  pecas: [
    { pecaId: 'p1', nome: 'Óleo 5W30', unidade: 'L', quantidade: '3,5', precoUnit: '42.90', precoCatalogo: 42.9, estoque: 20 },
    { pecaId: 'p2', nome: 'Filtro', unidade: 'un', quantidade: '1', precoUnit: '30.00', precoCatalogo: 35, estoque: 1 },
  ],
};

describe('editor de itens', () => {
  it('prévia do total bate no centavo com o servidor (quantidade fracionada)', () => {
    // 80 + 3,5 × 42,90 (=150,15) + 30 = 260,15
    const t = calcularTotais(itens, '10.00');
    expect(t).toEqual({ subtotal: 260.15, subtotalCatalogo: 265.15, desconto: 10, total: 250.15 });
  });

  it('desconto nunca passa do subtotal', () => {
    expect(calcularTotais(itens, '999.00').total).toBe(0);
  });

  it('manda preço só quando foi negociado (diferente da tabela)', () => {
    const envio = itensParaEnvio(itens);
    expect(envio.servicos).toEqual([{ servicoId: 's1', quantidade: 1 }]);
    expect(envio.pecas).toEqual([
      { pecaId: 'p1', quantidade: 3.5 },
      { pecaId: 'p2', quantidade: 1, precoUnit: 30 },
    ]);
  });

  it('não deixa enviar vazio nem com quantidade zerada', () => {
    expect(itensInvalidos({ servicos: [], pecas: [] })).toMatch(/ao menos 1/);
    expect(itensInvalidos({ ...itens, pecas: [{ ...itens.pecas[0], quantidade: '0' }] })).toMatch(/zerada/);
    expect(itensInvalidos(itens)).toBeNull();
  });
});
