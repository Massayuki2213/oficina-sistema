import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, LogOut, Wrench as Logo, Plus, FileText } from 'lucide-react';
import { LABEL_PERFIL, VERSAO } from '@hermes/shared';
import { useSessao } from '../features/acesso/sessao';
import { useOficina } from '../api/catalogo';
import { iniciais } from '../lib/format';
import { GRUPOS, ROTAS, podeAcessar } from '../rotas';
import { BuscaPlaca } from './BuscaPlaca';

export default function Layout({ children }: { children: ReactNode }) {
  const { usuario, sair, pode } = useSessao();
  const oficina = useOficina();
  const navegar = useNavigate();
  const { pathname } = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);

  // Trocou de tela no celular/tablet: fecha o menu.
  useEffect(() => setMenuAberto(false), [pathname]);

  const menu = (
    <aside className="bg-petroleo text-[#cfe0ea] flex flex-col h-full overflow-y-auto w-[238px]">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
        <div className="w-9 h-9 rounded-[10px] bg-laranja text-white grid place-items-center shadow-lg shadow-laranja/40 shrink-0">
          <Logo size={20} strokeWidth={2.4} />
        </div>
        <div className="min-w-0">
          <div className="text-xl font-extrabold text-white tracking-wide leading-none">HERMES</div>
          <div className="text-[10px] text-[#8fb0c4] truncate">{oficina.nome}</div>
        </div>
        <button onClick={() => setMenuAberto(false)} className="lg:hidden ml-auto text-white/70 hover:text-white" aria-label="Fechar menu">
          <X size={20} />
        </button>
      </div>

      <nav className="py-2 flex-1" aria-label="Menu principal">
        {GRUPOS.map((grupo) => {
          const itens = ROTAS.filter((r) => r.grupo === grupo && podeAcessar(r, usuario));
          if (itens.length === 0) return null;
          return (
            <div key={grupo} className="px-3 pb-1 pt-3">
              {grupo !== 'Principal' && (
                <div className="text-[10px] uppercase tracking-widest text-[#6f95ab] font-bold px-2 pb-1.5">{grupo}</div>
              )}
              {itens.map((r) => {
                const Icone = r.icone;
                return (
                  <NavLink
                    key={r.caminho}
                    to={r.caminho}
                    end={r.caminho === '/'}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                        isActive ? 'bg-laranja text-white shadow-md shadow-laranja/30' : 'hover:bg-white/10 hover:text-white'
                      }`
                    }
                  >
                    <Icone size={18} strokeWidth={2} className="shrink-0" />
                    <span>{r.rotulo}</span>
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div className="px-5 py-3 text-[10px] text-[#6f95ab] border-t border-white/10">Hermes {VERSAO}</div>
    </aside>
  );

  return (
    <div className="lg:grid lg:grid-cols-[238px_1fr] h-screen">
      {/* Menu fixo em tela grande; gaveta em tela pequena (tablet do mecânico). */}
      <div className="hidden lg:block h-screen nao-imprimir">{menu}</div>
      {menuAberto && (
        <div className="lg:hidden fixed inset-0 z-40 bg-petroleo/50 nao-imprimir" onClick={() => setMenuAberto(false)}>
          <div className="h-full w-fit" onClick={(e) => e.stopPropagation()}>
            {menu}
          </div>
        </div>
      )}

      <div className="flex flex-col h-screen min-w-0">
        <header className="nao-imprimir h-16 shrink-0 bg-white border-b border-linha flex items-center gap-3 px-3 sm:px-6 shadow-sm z-10">
          <button onClick={() => setMenuAberto(true)} className="lg:hidden p-2 -ml-1 text-petroleo" aria-label="Abrir menu">
            <Menu size={22} />
          </button>

          <BuscaPlaca />

          {pode('atender') && (
            <div className="hidden md:flex items-center gap-2">
              <button
                onClick={() => navegar('/ordens?nova=1')}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-laranja hover:bg-laranja-deep px-3 py-2 rounded-lg shadow-sm"
                title="Abrir uma OS direto, sem orçamento"
              >
                <Plus size={16} /> OS
              </button>
              <button
                onClick={() => navegar('/orcamentos?novo=1')}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-petroleo border border-linha hover:bg-fundo px-3 py-2 rounded-lg"
              >
                <FileText size={15} /> Orçamento
              </button>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2.5 pl-3 border-l border-linha">
              <div className="w-9 h-9 rounded-full bg-petroleo text-white grid place-items-center font-bold text-sm shrink-0">
                {iniciais(usuario?.nome ?? '')}
              </div>
              <div className="leading-tight hidden sm:block">
                <div className="font-bold text-[13px]">{usuario?.nome}</div>
                <div className="text-[11px] text-grafite/50">{usuario ? LABEL_PERFIL[usuario.perfil] : ''}</div>
              </div>
            </div>
            <button
              onClick={() => void sair()}
              title="Sair do sistema"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-grafite/60 hover:text-vermelho px-2.5 py-2 rounded-lg hover:bg-fundo transition"
            >
              <LogOut size={16} /> <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-3 sm:p-6 lg:p-7">{children}</main>
      </div>
    </div>
  );
}
