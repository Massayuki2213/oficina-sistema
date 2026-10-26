import { describe, expect, it } from 'vitest';
import { gerarCSV } from '../csv';
import type { ItemPecaOSDTO, OficinaDTO, OrcamentoDTO, OrdemServicoDTO } from '@hermes/shared';
import { AVISO_PRECO_ESTIMADO, linkWhatsApp, mensagens } from '../whatsapp';

describe('planilha (CSV para o Excel em português)', () => {
  it('usa ; como separador, vírgula decimal e protege texto com aspas', () => {
    const csv = gerarCSV(
      [
        { titulo: 'Descrição', valor: (l: { d: string; v: number }) => l.d },
        { titulo: 'Valor', valor: (l) => l.v },
      ],
      [
        { d: 'Óleo; filtro', v: 1234.5 },
        { d: 'Peça "original"', v: -10 },
      ],
    );
    expect(csv.split('\r\n')).toEqual(['Descrição;Valor', '"Óleo; filtro";1234,5', '"Peça ""original""";-10']);
  });
});

describe('WhatsApp', () => {
  it('põe o 55 do Brasil e codifica a mensagem', () => {
    expect(linkWhatsApp('(11) 98877-1234', 'Olá, tudo bem?')).toBe('https://wa.me/5511988771234?text=Ol%C3%A1%2C%20tudo%20bem%3F');
    expect(linkWhatsApp('5511988771234', 'oi')).toBe('https://wa.me/5511988771234?text=oi');
  });

  it('sem DDD não gera link (melhor sumir o botão que abrir a conversa errada)', () => {
    expect(linkWhatsApp('98877-1234', 'oi')).toBeNull();
    expect(linkWhatsApp(null, 'oi')).toBeNull();
  });
});

// ---- Mensagens prontas -------------------------------------------------------

const oficina = { nome: 'Auto Center Teste' } as OficinaDTO;

function peca(over: Partial<ItemPecaOSDTO> = {}): ItemPecaOSDTO {
  return {
    id: 'l1',
    pecaId: 'p1',
    nome: 'Pastilha de freio dianteira',
    unidade: 'jg',
    quantidade: 1,
    precoUnit: 180,
    precoCatalogo: 180,
    subtotal: 180,
    estoqueAtual: 5,
    codigo: null,
    precoADefinir: false,
    encomenda: 0,
    aPedir: false,
    pedido: null,
    chegou: null,
    precoConferido: true,
    ...over,
  };
}

function orcamento(pecas: ItemPecaOSDTO[], observacoes: string | null = null) {
  return {
    numero: 7,
    cliente: { nome: 'Maria Souza' },
    carro: { modelo: 'Gol', placa: 'ABC1D23' },
    servicos: [],
    pecas,
    desconto: 0,
    total: 180,
    validade: '2026-11-10T12:00:00.000Z',
    observacoes,
  } as unknown as OrcamentoDTO;
}

describe('orçamento no WhatsApp', () => {
  it('peça que vai ser encomendada leva o aviso de valor estimado', () => {
    const texto = mensagens.orcamento(orcamento([peca({ estoqueAtual: 0 })]), oficina);
    expect(texto).toContain(AVISO_PRECO_ESTIMADO);
  });

  it('peça cadastrada só pelo nome também é estimada', () => {
    expect(mensagens.orcamento(orcamento([peca({ precoADefinir: true })]), oficina)).toContain(AVISO_PRECO_ESTIMADO);
  });

  it('com tudo na prateleira, sem aviso; as observações vão junto', () => {
    const texto = mensagens.orcamento(orcamento([peca()], 'Diagnóstico: pastilha no fim.'), oficina);
    expect(texto).not.toContain(AVISO_PRECO_ESTIMADO);
    expect(texto).toContain('Diagnóstico: pastilha no fim.');
  });
});

describe('lista de peças para a autopeça', () => {
  const os = {
    carro: { marca: 'VW', modelo: 'Gol 1.6', ano: 2015, placa: 'ABC1D23', chassi: '9BWAB45U0FT000000', combustivel: 'Flex' },
  } as unknown as OrdemServicoDTO;

  it('leva o carro, só a quantidade que falta e o código, sem o preço do cliente', () => {
    const texto = mensagens.pedidoPecas(
      os,
      [peca({ quantidade: 2, encomenda: 2, codigo: 'N-1234' }), peca({ nome: 'Disco de freio', unidade: 'un', quantidade: 2, encomenda: 1 })],
      { contato: 'João Peças' },
      oficina,
    );
    expect(texto.split('\n')).toEqual([
      'Olá, João! Aqui é da Auto Center Teste. Preciso destas peças:',
      '',
      'Veículo: VW Gol 1.6 2015 — placa ABC1D23',
      'Chassi: 9BWAB45U0FT000000',
      'Combustível: Flex',
      '',
      '• 2 jg — Pastilha de freio dianteira (cód. N-1234)',
      '• 1 un — Disco de freio',
      '',
      'Tem disponível? Me passa o valor e o prazo, por favor.',
    ]);
    expect(texto).not.toContain('180');
  });

  it('cumprimenta o contato com o tratamento junto do nome', () => {
    const texto = mensagens.pedidoPecas(os, [peca({ encomenda: 1 })], { contato: 'Sr. Almeida' }, oficina);
    expect(texto.startsWith('Olá, Sr. Almeida! ')).toBe(true);
  });
});
