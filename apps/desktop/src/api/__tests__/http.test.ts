import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, http, novaChave } from '../http';

// Idempotência do lado da tela (ADR 0011): todo POST leva uma chave, e toda
// tentativa de novo leva a MESMA chave — é o que deixa o servidor devolver a
// resposta da primeira em vez de lançar a venda duas vezes.

const resposta = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('chave de idempotência', () => {
  it('128 bits em hexadecimal, uma diferente por chamada', () => {
    const a = novaChave();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(novaChave()).not.toBe(a);
  });

  it('a rede caiu na primeira tentativa: repete com a MESMA chave', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(resposta(201, { id: 'venda-1' }));
    vi.stubGlobal('fetch', fetch);

    await expect(http.post('/vendas', { itens: [] })).resolves.toEqual({ id: 'venda-1' });
    expect(fetch).toHaveBeenCalledTimes(2);
    const chaves = fetch.mock.calls.map(([, init]) => (init as RequestInit & { headers: Record<string, string> }).headers['Idempotency-Key']);
    expect(chaves[0]).toMatch(/^[0-9a-f]{32}$/);
    expect(chaves[1]).toBe(chaves[0]);
  });

  it('a primeira ainda está sendo gravada (409 em andamento): espera e pergunta de novo', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(resposta(409, { message: 'processando', codigo: 'OPERACAO_EM_ANDAMENTO' }))
      .mockResolvedValueOnce(resposta(201, { id: 'venda-1' }));
    vi.stubGlobal('fetch', fetch);

    await expect(http.post('/vendas', {})).resolves.toEqual({ id: 'venda-1' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('sem rede de jeito nenhum: desiste com mensagem clara', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(http.post('/vendas', {})).rejects.toMatchObject({ status: 0, message: expect.stringMatching(/Sem conexão/) });
  }, 10_000);

  it('GET não leva chave nem repete sozinho', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetch);
    await expect(http.get('/clientes')).rejects.toBeInstanceOf(ApiError);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch.mock.calls[0][1] as { headers: Record<string, string> }).headers['Idempotency-Key']).toBeUndefined();
  });
});
