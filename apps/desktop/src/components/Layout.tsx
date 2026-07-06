import { type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
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
  Wrench as Logo,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { iniciais, LABEL_PERFIL } from '../lib/format';

type Item = { to: string; label: string; icon: LucideIcon; financeiro?: boolean };
const GRUPOS: { titulo: string; itens: Item[] }[] = [
  { titulo: 'Principal', itens: [{ to: '/', label: 'Início', icon: Home }] },
  {
    titulo: 'Cadastros',
    itens: [
      { to: '/clientes', label: 'Clientes', icon: Users },
      { to: '/carros', label: 'Carros', icon: Car },
      { to: '/servicos', label: 'Serviços', icon: Wrench },
      { to: '/estoque', label: 'Estoque', icon: Package },
    ],
  },
  {
    titulo: 'Operação',
    itens: [
      { to: '/orcamentos', label: 'Orçamentos', icon: FileText },
      { to: '/ordens', label: 'Ordens de Serviço', icon: ClipboardList },
      { to: '/agenda', label: 'Agenda', icon: CalendarDays },
    ],
  },
  {
    titulo: 'Financeiro',
    itens: [
      { to: '/caixa', label: 'Livro-Caixa', icon: Wallet, financeiro: true },
      { to: '/despesas', label: 'Despesas', icon: TrendingDown, financeiro: true },
      { to: '/contas-receber', label: 'Contas a Receber', icon: Receipt, financeiro: true },
      { to: '/relatorios', label: 'Relatórios', icon: BarChart3, financeiro: true },
    ],
  },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { usuario, sair, podeVerFinanceiro } = useAuth();

  return (
    <div className="grid grid-cols-[238px_1fr] grid-rows-[64px_1fr] h-screen">
      {/* Sidebar */}
      <aside className="row-span-2 bg-petroleo text-[#cfe0ea] flex flex-col overflow-y-auto">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          <div className="w-9 h-9 rounded-[10px] bg-laranja text-white grid place-items-center shadow-lg shadow-laranja/40">
            <Logo size={20} strokeWidth={2.4} />
          </div>
          <div>
            <div className="text-xl font-extrabold text-white tracking-wide leading-none">HERMES</div>
            <div className="text-[10px] text-[#8fb0c4]">Gestão de Oficina</div>
          </div>
        </div>

        <nav className="py-3">
          {GRUPOS.map((g) => (
            <div key={g.titulo} className="px-3 pb-1 pt-3">
              <div className="text-[10px] uppercase tracking-widest text-[#6f95ab] font-bold px-2 pb-1.5">{g.titulo}</div>
              {g.itens
                .filter((i) => !i.financeiro || podeVerFinanceiro)
                .map((i) => {
                  const Icon = i.icon;
                  return (
                    <NavLink
                      key={i.to}
                      to={i.to}
                      end={i.to === '/'}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                          isActive ? 'bg-laranja text-white shadow-md shadow-laranja/30' : 'hover:bg-white/10 hover:text-white'
                        }`
                      }
                    >
                      <Icon size={18} strokeWidth={2} className="shrink-0" />
                      <span>{i.label}</span>
                    </NavLink>
                  );
                })}
            </div>
          ))}
        </nav>
      </aside>

      {/* Topbar */}
      <header className="col-start-2 bg-white border-b border-linha flex items-center px-6 shadow-sm z-10">
        <div className="text-sm text-grafite/60">
          Bem-vindo, <span className="font-semibold text-grafite">{usuario?.nome}</span>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-3 pl-4 border-l border-linha">
            <div className="w-9 h-9 rounded-full bg-petroleo text-white grid place-items-center font-bold text-sm">
              {iniciais(usuario?.nome ?? '')}
            </div>
            <div className="leading-tight">
              <div className="font-bold text-[13px]">{usuario?.nome}</div>
              <div className="text-[11px] text-grafite/50">{LABEL_PERFIL[usuario?.perfil ?? '']}</div>
            </div>
          </div>
          <button
            onClick={sair}
            className="text-[13px] font-semibold text-grafite/60 hover:text-vermelho px-3 py-2 rounded-lg hover:bg-fundo transition"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="col-start-2 overflow-y-auto p-4 sm:p-6 lg:p-7">{children}</main>
    </div>
  );
}
