import { describe, it, expect } from 'vitest';
import { descreverRota, resumirCorpo } from '../src/lib/auditoria.js';

// Testes puros: não tocam no banco. O que se prova aqui é que nenhuma senha
// escapa para o log e que a rota é lida como a ação certa.

describe('auditoria — senha nunca chega ao log', () => {
  const SEGREDO = 'senha-secreta-123';

  it.each([
    ['no topo', { email: 'a@b.com', senha: SEGREDO }],
    ['troca de senha', { senhaAtual: SEGREDO, novaSenha: SEGREDO }],
    ['confirmação', { confirmarSenha: SEGREDO }],
    ['senha do Dono (RN-08)', { desconto: 90, senhaDono: SEGREDO }],
    ['hash', { senhaHash: `$2b$10$${SEGREDO}` }],
    ['token', { token: SEGREDO }],
    ['aninhada em objeto', { usuario: { nome: 'Ana', senha: SEGREDO } }],
    ['dentro de lista', { itens: [{ senha: SEGREDO }, { ok: 1 }] }],
    ['maiúsculas', { SENHA: SEGREDO }],
    ['fundo aninhado', { a: { b: { c: { senha: SEGREDO } } } }],
  ])('mascara %s', (_caso, corpo) => {
    const saida = resumirCorpo(corpo) ?? '';
    expect(saida).not.toContain(SEGREDO);
    expect(saida).toContain('***');
  });

  it('não estraga o corpo normal', () => {
    const saida = resumirCorpo({ nome: 'Filtro de óleo', precoVenda: 45.9, ativo: true });
    expect(saida).toContain('Filtro de óleo');
    expect(saida).toContain('45.9');
  });

  it('corpo vazio não vira registro', () => {
    expect(resumirCorpo({})).toBeNull();
    expect(resumirCorpo(null)).toBeNull();
    expect(resumirCorpo(undefined)).toBeNull();
  });

  it('corpo gigante é truncado (não estoura a coluna)', () => {
    const saida = resumirCorpo({ observacoes: 'x'.repeat(50_000) }) ?? '';
    expect(saida.length).toBeLessThanOrEqual(801);
  });
});

describe('auditoria — a rota vira a ação certa', () => {
  const ID = 'clx1234567890abcdefghij';

  it.each([
    ['DELETE', `/clientes/${ID}`, 'clientes', ID, 'EXCLUIR'],
    ['POST', '/clientes', 'clientes', null, 'CRIAR'],
    ['PUT', `/pecas/${ID}`, 'pecas', ID, 'ALTERAR'],
    ['POST', `/orcamentos/${ID}/aprovar`, 'orcamentos', ID, 'APROVAR'],
    ['PATCH', `/orcamentos/${ID}/status`, 'orcamentos', ID, 'STATUS'],
    ['POST', `/ordens/${ID}/receber`, 'ordens', ID, 'RECEBER'],
    ['POST', `/ordens/${ID}/garantia`, 'ordens', ID, 'GARANTIA'],
    ['PATCH', '/usuarios/minha-senha', 'usuarios', null, 'MINHA_SENHA'],
    ['PATCH', `/usuarios/${ID}/ativo`, 'usuarios', ID, 'ATIVO'],
    ['PATCH', `/compras/${ID}/pagar`, 'compras', ID, 'PAGAR'],
    // O id nem sempre vem logo depois da entidade.
    ['POST', `/compras/acerto/${ID}`, 'compras', ID, 'ACERTO'],
    // Query string não pode virar parte da ação.
    ['POST', `/contas-receber/${ID}/receber?x=1`, 'contas-receber', ID, 'RECEBER'],
  ])('%s %s', (metodo, url, entidade, entidadeId, acao) => {
    expect(descreverRota(metodo, url)).toEqual({ entidade, entidadeId, acao });
  });
});
