import { type ReactNode } from 'react';
import { Search, Lock, X, Pencil, Trash2, type LucideIcon } from 'lucide-react';
import { PERIODOS, type PeriodoKey } from '../lib/periodo';

// Peças de UI reutilizadas pelas telas (mesma linguagem visual do Hermes).

export const inputCls =
  'w-full px-3 py-2.5 border-[1.6px] border-linha rounded-lg outline-none focus:border-laranja';
export const thCls = 'px-4 py-3 font-bold text-left text-[11px] uppercase tracking-wide text-grafite/50';
export const tdCls = 'px-4 py-3 text-sm';

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-4 mb-6 flex-wrap">
      <div>
        <h1 className="text-2xl font-extrabold text-petroleo">{title}</h1>
        {subtitle && <p className="text-grafite/50 text-sm mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex-1" />
      {children}
    </div>
  );
}

export function SearchBar(props: { value: string; onChange: (v: string) => void; onSubmit: () => void; placeholder?: string }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit();
      }}
      className="flex items-center gap-2 bg-white border border-linha rounded-xl px-3.5 py-2.5 w-full max-w-xs focus-within:border-laranja"
    >
      <Search size={16} className="text-grafite/40 shrink-0" />
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className="flex-1 outline-none text-sm bg-transparent"
      />
    </form>
  );
}

export function BtnPrimary({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-laranja hover:bg-laranja-deep disabled:opacity-60 text-white font-bold px-4 py-2.5 rounded-xl shadow-md shadow-laranja/25 transition whitespace-nowrap"
    >
      {children}
    </button>
  );
}

export function BtnGhost({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="px-4 py-2.5 rounded-xl border-[1.6px] border-linha font-bold text-petroleo hover:bg-fundo transition">
      {children}
    </button>
  );
}

export function Painel({ children }: { children: ReactNode }) {
  // O wrapper interno rola na horizontal quando o conteúdo (tabelas largas) não
  // cabe, em vez de cortar. A tabela ganha uma largura mínima só quando aperta.
  return (
    <div className="bg-white rounded-2xl border border-linha shadow-sm overflow-hidden">
      <div className="overflow-x-auto [&>table]:min-w-[620px]">{children}</div>
    </div>
  );
}

export function Badge({ children, cor = 'bg-linha text-grafite/60' }: { children: ReactNode; cor?: string }) {
  return <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${cor}`}>{children}</span>;
}

// Ações de linha (editar / excluir) — mesmo visual em todos os cadastros.
export function AcaoEditar({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="Editar" className="text-grafite/50 hover:text-petroleo p-1.5 rounded-lg hover:bg-fundo transition">
      <Pencil size={16} />
    </button>
  );
}
export function AcaoExcluir({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title="Excluir" className="text-grafite/40 hover:text-vermelho p-1.5 rounded-lg hover:bg-fundo disabled:opacity-40 transition">
      <Trash2 size={16} />
    </button>
  );
}

export function Modal({ title, onClose, children, footer, size = 'md' }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode; size?: 'md' | 'lg' }) {
  const largura = size === 'lg' ? 'max-w-2xl' : 'max-w-md';
  return (
    <div className="fixed inset-0 bg-petroleo/50 grid place-items-center p-5 z-50" onClick={onClose}>
      <div className={`bg-white rounded-2xl w-full ${largura} max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center px-6 py-5 border-b border-linha">
          <h3 className="text-lg font-extrabold text-petroleo">{title}</h3>
          <button onClick={onClose} className="ml-auto text-grafite/40 hover:text-grafite w-8 h-8 grid place-items-center rounded-lg hover:bg-fundo">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-3.5">{children}</div>
        <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-linha">{footer}</div>
      </div>
    </div>
  );
}

export function Campo({ label, erro, children }: { label: string; erro?: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-grafite/50 mb-1.5">{label}</label>
      {children}
      {erro && <div className="text-vermelho text-xs mt-1">{erro}</div>}
    </div>
  );
}

export function VazioOuCarregando({ carregando, vazio, colSpan }: { carregando: boolean; vazio: boolean; colSpan: number }) {
  if (!carregando && !vazio) return null;
  return (
    <tr>
      <td colSpan={colSpan} className="text-center text-grafite/40 py-10 text-sm">
        {carregando ? 'Carregando...' : 'Nada encontrado.'}
      </td>
    </tr>
  );
}

// Cartão de indicador (usado nas telas financeiras).
export function Kpi({ label, valor, sub, icon: Icon, cor = 'bg-fundo text-grafite/50' }: { label: string; valor: string; sub?: ReactNode; icon?: LucideIcon; cor?: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-linha shadow-sm relative">
      {Icon && (
        <div className={`absolute top-4 right-4 w-11 h-11 rounded-xl grid place-items-center ${cor}`}>
          <Icon size={22} strokeWidth={2.2} />
        </div>
      )}
      <div className="text-[13px] text-grafite/50 font-semibold">{label}</div>
      <div className="text-3xl font-extrabold mt-2 leading-none">{valor}</div>
      {sub && <div className="text-xs mt-2 font-semibold text-grafite/50">{sub}</div>}
    </div>
  );
}

// Seletor de período (Hoje / 7 dias / Este mês / Tudo).
export function Periodo({ value, onChange }: { value: PeriodoKey; onChange: (k: PeriodoKey) => void }) {
  return (
    <div className="flex items-center gap-1 bg-white border border-linha rounded-xl p-1">
      {PERIODOS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={`px-3 py-1.5 rounded-lg text-sm font-bold transition ${
            value === p.key ? 'bg-petroleo text-white shadow-sm' : 'text-grafite/60 hover:bg-fundo'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// Tela de bloqueio quando o perfil não tem acesso à área.
export function Restrito({ children }: { children?: ReactNode }) {
  return (
    <div className="grid place-items-center h-[60vh] text-center">
      <div>
        <div className="w-16 h-16 rounded-2xl bg-fundo grid place-items-center mx-auto mb-3 text-grafite/40">
          <Lock size={30} strokeWidth={2} />
        </div>
        <h2 className="text-xl font-extrabold text-petroleo">Acesso restrito</h2>
        <p className="text-grafite/50 mt-1 text-sm">{children ?? 'Esta área é exclusiva do Dono.'}</p>
      </div>
    </div>
  );
}
