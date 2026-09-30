import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import {
  Home,
  Users,
  Car,
  Wrench,
  Package,
  FileText,
  ClipboardList,
  CalendarDays,
  Wallet,
  TrendingDown,
  Receipt,
  BarChart3,
  Settings,
  Truck,
  ShoppingCart,
  ShoppingBag,
  History,
  LifeBuoy,
  type LucideIcon,
} from 'lucide-react';
import type { Permissao, UsuarioSessao } from '@hermes/shared';

// ============================================================
// Tabela única das telas: dela saem o menu lateral E a trava de
// acesso de cada rota. A regra de "quem vê o quê" fica num lugar
// só — e é a mesma que o servidor aplica (@hermes/shared).
// Cada tela é carregada sob demanda (o app abre mais rápido).
// ============================================================

export type Grupo = 'Principal' | 'Atendimento' | 'Cadastros' | 'Estoque' | 'Financeiro' | 'Sistema';

export interface Rota {
  caminho: string;
  rotulo: string;
  icone: LucideIcon;
  grupo: Grupo;
  /** Precisa de TODAS. */
  permissoes?: Permissao[];
  /** Precisa de ALGUMA. */
  alguma?: Permissao[];
  tela: LazyExoticComponent<ComponentType>;
}

export const ROTAS: Rota[] = [
  { caminho: '/', rotulo: 'Início', icone: Home, grupo: 'Principal', tela: lazy(() => import('./features/painel/Painel')) },

  { caminho: '/ordens', rotulo: 'Ordens de Serviço', icone: ClipboardList, grupo: 'Atendimento', tela: lazy(() => import('./features/ordens/OrdensPage')) },
  { caminho: '/orcamentos', rotulo: 'Orçamentos', icone: FileText, grupo: 'Atendimento', permissoes: ['atender'], tela: lazy(() => import('./features/orcamentos/OrcamentosPage')) },
  { caminho: '/agenda', rotulo: 'Agenda', icone: CalendarDays, grupo: 'Atendimento', tela: lazy(() => import('./features/agenda/AgendaPage')) },
  { caminho: '/vendas', rotulo: 'Venda de balcão', icone: ShoppingBag, grupo: 'Atendimento', permissoes: ['atender'], tela: lazy(() => import('./features/vendas/VendasPage')) },

  { caminho: '/clientes', rotulo: 'Clientes', icone: Users, grupo: 'Cadastros', permissoes: ['cadastrarClientes'], tela: lazy(() => import('./features/clientes/ClientesPage')) },
  { caminho: '/veiculos', rotulo: 'Veículos', icone: Car, grupo: 'Cadastros', permissoes: ['cadastrarClientes'], tela: lazy(() => import('./features/veiculos/VeiculosPage')) },
  { caminho: '/servicos', rotulo: 'Serviços', icone: Wrench, grupo: 'Cadastros', tela: lazy(() => import('./features/servicos/ServicosPage')) },

  { caminho: '/estoque', rotulo: 'Estoque', icone: Package, grupo: 'Estoque', tela: lazy(() => import('./features/estoque/EstoquePage')) },
  { caminho: '/compras', rotulo: 'Compras', icone: ShoppingCart, grupo: 'Estoque', alguma: ['alterarPrecoCusto', 'verFinanceiro'], tela: lazy(() => import('./features/compras/ComprasPage')) },
  { caminho: '/distribuidores', rotulo: 'Distribuidores', icone: Truck, grupo: 'Estoque', alguma: ['alterarPrecoCusto', 'verFinanceiro'], tela: lazy(() => import('./features/distribuidores/DistribuidoresPage')) },

  { caminho: '/caixa', rotulo: 'Livro-caixa', icone: Wallet, grupo: 'Financeiro', permissoes: ['verFinanceiro'], tela: lazy(() => import('./features/caixa/CaixaPage')) },
  { caminho: '/contas-receber', rotulo: 'Contas a receber', icone: Receipt, grupo: 'Financeiro', permissoes: ['receberPagamentos'], tela: lazy(() => import('./features/contas/ContasPage')) },
  { caminho: '/despesas', rotulo: 'Despesas', icone: TrendingDown, grupo: 'Financeiro', permissoes: ['verFinanceiro'], tela: lazy(() => import('./features/despesas/DespesasPage')) },
  { caminho: '/relatorios', rotulo: 'Relatórios', icone: BarChart3, grupo: 'Financeiro', permissoes: ['verFinanceiro'], tela: lazy(() => import('./features/relatorios/RelatoriosPage')) },

  { caminho: '/configuracoes', rotulo: 'Configurações', icone: Settings, grupo: 'Sistema', tela: lazy(() => import('./features/configuracoes/ConfiguracoesPage')) },
  { caminho: '/auditoria', rotulo: 'Histórico', icone: History, grupo: 'Sistema', permissoes: ['verAuditoria'], tela: lazy(() => import('./features/auditoria/AuditoriaPage')) },
  { caminho: '/ajuda', rotulo: 'Ajuda', icone: LifeBuoy, grupo: 'Sistema', tela: lazy(() => import('./features/ajuda/AjudaPage')) },
];

export const GRUPOS: Grupo[] = ['Principal', 'Atendimento', 'Cadastros', 'Estoque', 'Financeiro', 'Sistema'];

export function podeAcessar(rota: Rota, usuario: UsuarioSessao | null) {
  if (!usuario) return false;
  const p = usuario.permissoes;
  if (rota.permissoes && !rota.permissoes.every((x) => p[x])) return false;
  if (rota.alguma && !rota.alguma.some((x) => p[x])) return false;
  return true;
}
