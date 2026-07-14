import type { Perfil } from './enums.js';

// ============================================================
// Permissões por perfil — base das regras da seção 2 do
// PLANEJAMENTO.md. Fonte única usada pela API (para bloquear)
// e pelo Desktop (para esconder/desabilitar botões).
// ============================================================

export interface Permissoes {
  verFinanceiro: boolean; // livro-caixa, despesas, relatórios de lucro
  darDesconto: boolean; // aplicar desconto em orçamento/OS
  alterarPrecoCusto: boolean; // mexer no custo/margem das peças
  gerenciarUsuarios: boolean; // cadastrar/editar usuários e perfis
  apagarRegistros: boolean; // exclusões definitivas / apagar histórico
  gerenciarBackup: boolean; // ver e gerar cópias de segurança do banco
}

export const PERMISSOES: Record<Perfil, Permissoes> = {
  DONO: {
    verFinanceiro: true,
    darDesconto: true,
    alterarPrecoCusto: true,
    gerenciarUsuarios: true,
    apagarRegistros: true,
    gerenciarBackup: true,
  },
  ATENDENTE: {
    verFinanceiro: false,
    darDesconto: true,
    alterarPrecoCusto: false,
    gerenciarUsuarios: false,
    apagarRegistros: false,
    gerenciarBackup: false,
  },
  MECANICO: {
    verFinanceiro: false,
    darDesconto: false,
    alterarPrecoCusto: false,
    gerenciarUsuarios: false,
    apagarRegistros: false,
    gerenciarBackup: false,
  },
};

/** Atalho para checar uma permissão de um perfil. */
export function pode(perfil: Perfil, acao: keyof Permissoes): boolean {
  return PERMISSOES[perfil][acao];
}
