import { describe, expect, it } from 'vitest';
import { gerarCSV } from '../csv';
import { linkWhatsApp } from '../whatsapp';

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
