import type { Perfil } from './enums.js';

// ============================================================
// Permissões por perfil — seção 2 do PLANEJAMENTO.md.
//
// Fonte única: a API usa para BLOQUEAR, a tela usa para ESCONDER.
// A tela esconder não é segurança — é só não oferecer o que vai
// dar "sem permissão". Quem decide é sempre o servidor.
// ============================================================

export interface Permissoes {
  /** Livro-caixa, despesas, compras e relatórios de lucro. */
  verFinanceiro: boolean;
  /** Receber pagamento de OS, dar baixa em parcela, lançar fiado antigo. */
  receberPagamentos: boolean;
  /** Dar desconto ou baixar preço de item (até o teto; acima, senha do Dono — RN-08). */
  darDesconto: boolean;
  /** Ver preço de custo e margem das peças. */
  verCusto: boolean;
  /** Cadastrar/editar peças (custo), distribuidores e compras. */
  alterarPrecoCusto: boolean;
  /** Cadastrar e editar clientes e veículos. */
  cadastrarClientes: boolean;
  /** Balcão: orçamentos, abrir e editar OS, catálogo de serviços, agenda. */
  atender: boolean;
  /** Dar entrada de mercadoria no estoque (sem mexer no custo). */
  movimentarEstoque: boolean;
  /** Acertar o estoque com a contagem física (inventário). */
  ajustarEstoque: boolean;
  /** Criar usuários, redefinir senha, ativar/inativar. */
  gerenciarUsuarios: boolean;
  /** Dados da oficina e regras do negócio (teto de desconto, garantia...). */
  configurarOficina: boolean;
  /** Excluir registros e estornar pagamentos. */
  apagarRegistros: boolean;
  /** Ver e gerar cópias de segurança do banco. */
  gerenciarBackup: boolean;
  /** Consultar o histórico de quem fez o quê. */
  verAuditoria: boolean;
  /** Ver todas as OS. Sem isto, só as atribuídas a si (e as sem mecânico, para assumir). */
  verTodasOS: boolean;
}

export type Permissao = keyof Permissoes;

export const PERMISSOES: Record<Perfil, Permissoes> = {
  DONO: {
    verFinanceiro: true,
    receberPagamentos: true,
    darDesconto: true,
    verCusto: true,
    alterarPrecoCusto: true,
    cadastrarClientes: true,
    atender: true,
    movimentarEstoque: true,
    ajustarEstoque: true,
    gerenciarUsuarios: true,
    configurarOficina: true,
    apagarRegistros: true,
    gerenciarBackup: true,
    verAuditoria: true,
    verTodasOS: true,
  },
  ATENDENTE: {
    verFinanceiro: false,
    receberPagamentos: true,
    darDesconto: true,
    verCusto: false,
    alterarPrecoCusto: false,
    cadastrarClientes: true,
    atender: true,
    movimentarEstoque: true,
    ajustarEstoque: false,
    gerenciarUsuarios: false,
    configurarOficina: false,
    apagarRegistros: false,
    gerenciarBackup: false,
    verAuditoria: false,
    verTodasOS: true,
  },
  MECANICO: {
    verFinanceiro: false,
    receberPagamentos: false,
    darDesconto: false,
    verCusto: false,
    alterarPrecoCusto: false,
    cadastrarClientes: false,
    atender: false,
    movimentarEstoque: false,
    ajustarEstoque: false,
    gerenciarUsuarios: false,
    configurarOficina: false,
    apagarRegistros: false,
    gerenciarBackup: false,
    verAuditoria: false,
    verTodasOS: false,
  },
};

/** Atalho para checar uma permissão de um perfil. */
export function pode(perfil: Perfil, acao: Permissao): boolean {
  return PERMISSOES[perfil][acao];
}
