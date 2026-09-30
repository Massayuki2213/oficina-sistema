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

  it('logo da oficina (imagem em base64) não entra inteiro no log', () => {
    const saida = resumirCorpo({ nome: 'Oficina', logo: `data:image/png;base64,${'A'.repeat(5000)}` }) ?? '';
    expect(saida).toContain('[imagem]');
    expect(saida.length).toBeLessThan(200);
  });

  it('dado pessoal de contato não entra no log (LGPD), só que foi informado', () => {
    const saida = resumirCorpo({ nome: 'Ana', cpfCnpj: '52998224725', telefone: '11999990000', whatsapp: '11988887777', endereco: 'Rua A, 1' }) ?? '';
    expect(saida).not.toMatch(/52998224725|11999990000|11988887777|Rua A/);
    expect(saida).toContain('(dado pessoal)');
    expect(saida).toContain('Ana');
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
    ['DELETE', '/api/clientes/:id', { id: ID }, 'clientes', ID, 'EXCLUIR'],
    ['POST', '/api/clientes', {}, 'clientes', null, 'CRIAR'],
    ['PUT', '/api/pecas/:id', { id: ID }, 'pecas', ID, 'ALTERAR'],
    ['POST', '/api/orcamentos/:id/aprovar', { id: ID }, 'orcamentos', ID, 'APROVAR'],
    ['PATCH', '/api/orcamentos/:id/status', { id: ID }, 'orcamentos', ID, 'STATUS'],
    ['POST', '/api/ordens/:id/receber', { id: ID }, 'ordens', ID, 'RECEBER'],
    ['POST', '/api/ordens/:id/estornar-pagamento', { id: ID }, 'ordens', ID, 'ESTORNAR_PAGAMENTO'],
    ['PATCH', '/api/usuarios/minha-senha', {}, 'usuarios', null, 'MINHA_SENHA'],
    ['PATCH', '/api/usuarios/:id/ativo', { id: ID }, 'usuarios', ID, 'ATIVO'],
    // O id nem sempre é o :id — nem vem logo depois da entidade.
    ['POST', '/api/compras/acerto/:fornecedorId', { fornecedorId: ID }, 'compras', ID, 'ACERTO'],
    ['POST', '/api/contas-receber/:id/receber', { id: ID }, 'contas-receber', ID, 'RECEBER'],
  ])('%s %s', (metodo, rota, params, entidade, entidadeId, acao) => {
    expect(descreverRota(metodo, rota, params)).toEqual({ entidade, entidadeId, acao });
  });

  it('a ação configurada na rota tem prioridade (itens da OS)', () => {
    expect(descreverRota('DELETE', '/api/ordens/:id/pecas/:itemId', { id: ID, itemId: 'x' }, 'REMOVER_PECA')).toEqual({
      entidade: 'ordens',
      entidadeId: ID,
      acao: 'REMOVER_PECA',
    });
  });
});
