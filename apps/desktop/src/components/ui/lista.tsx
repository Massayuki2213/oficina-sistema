import { useEffect, useState, type ReactNode } from 'react';
import { Search, Lock, AlertTriangle, RefreshCw, ChevronLeft, ChevronRight, X, type LucideIcon } from 'lucide-react';
import { PERIODOS, type PeriodoKey } from '../../lib/periodo';
import { mascaraPlaca } from '../../lib/mascaras';
import { mensagemDeErro } from '../../api/http';

export const thCls = 'px-4 py-3 font-bold text-left text-[11px] uppercase tracking-wide text-grafite/50 whitespace-nowrap';
export const tdCls = 'px-4 py-3 text-sm';
export const linhaCls = 'border-b border-fundo last:border-0 hover:bg-fundo/40 transition';

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-5 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold text-petroleo">{title}</h1>
        {subtitle && <p className="text-grafite/50 text-sm mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-2.5 flex-wrap">{children}</div>
    </div>
  );
}

/**
 * Busca que filtra enquanto digita (espera a pessoa parar 300 ms para não
 * disparar uma consulta por letra).
 */
export function CampoBusca({
  valor,
  onBuscar,
  placeholder,
  autoFocus,
}: {
  valor: string;
  onBuscar: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [texto, setTexto] = useState(valor);
  useEffect(() => setTexto(valor), [valor]);
  useEffect(() => {
    if (texto === valor) return;
    const t = setTimeout(() => onBuscar(texto.trim()), 300);
    return () => clearTimeout(t);
  }, [texto, valor, onBuscar]);

  return (
    <div className="flex items-center gap-2 bg-white border border-linha rounded-xl px-3.5 py-2.5 w-full sm:w-72 focus-within:border-laranja">
      <Search size={16} className="text-grafite/40 shrink-0" />
      <input
        value={texto}
        autoFocus={autoFocus}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onBuscar(texto.trim())}
        placeholder={placeholder}
        aria-label={placeholder ?? 'Buscar'}
        className="flex-1 min-w-0 outline-none text-sm bg-transparent"
      />
      {texto && (
        <button type="button" onClick={() => { setTexto(''); onBuscar(''); }} aria-label="Limpar busca" className="text-grafite/40 hover:text-grafite">
          <X size={15} />
        </button>
      )}
    </div>
  );
}

export function Painel({ children, className = '' }: { children: ReactNode; className?: string }) {
  // O wrapper interno rola na horizontal quando a tabela não cabe, em vez de cortar.
  return (
    <div className={`bg-white rounded-2xl border border-linha shadow-sm overflow-hidden ${className}`}>
      <div className="overflow-x-auto [&>table]:min-w-[640px]">{children}</div>
    </div>
  );
}

/** Linha de estado dentro do <tbody>: carregando, erro ou vazio. */
export function EstadoTabela({
  carregando,
  erro,
  vazio,
  colSpan,
  textoVazio = 'Nada encontrado.',
  onTentar,
}: {
  carregando: boolean;
  erro?: unknown;
  vazio: boolean;
  colSpan: number;
  textoVazio?: ReactNode;
  onTentar?: () => void;
}) {
  if (!carregando && !erro && !vazio) return null;
  return (
    <tr>
      <td colSpan={colSpan} className="text-center py-10 text-sm">
        {carregando ? (
          <span className="text-grafite/40">Carregando...</span>
        ) : erro ? (
          <span className="text-vermelho font-semibold">
            {mensagemDeErro(erro)}{' '}
            {onTentar && (
              <button onClick={onTentar} className="underline font-bold ml-1">
                Tentar de novo
              </button>
            )}
          </span>
        ) : (
          <span className="text-grafite/40">{textoVazio}</span>
        )}
      </td>
    </tr>
  );
}

export function Paginacao({
  pagina,
  porPagina,
  total,
  onPagina,
}: {
  pagina: number;
  porPagina: number;
  total: number;
  onPagina: (p: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (total <= porPagina) return null;
  const de = (pagina - 1) * porPagina + 1;
  const ate = Math.min(total, pagina * porPagina);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-linha text-sm">
      <span className="text-grafite/50 tabular-nums">
        {de}–{ate} de {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPagina(pagina - 1)}
          disabled={pagina <= 1}
          aria-label="Página anterior"
          className="p-1.5 rounded-lg border border-linha disabled:opacity-40 hover:bg-fundo"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="px-2 font-semibold tabular-nums">
          {pagina} / {paginas}
        </span>
        <button
          onClick={() => onPagina(pagina + 1)}
          disabled={pagina >= paginas}
          aria-label="Próxima página"
          className="p-1.5 rounded-lg border border-linha disabled:opacity-40 hover:bg-fundo"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export function Badge({ children, cor = 'bg-linha text-grafite/60' }: { children: ReactNode; cor?: string }) {
  return <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${cor}`}>{children}</span>;
}

/** A placa como aparece no carro: fundo escuro, letra de forma. */
export function Placa({ placa, grande }: { placa: string; grande?: boolean }) {
  return (
    <span
      className={`font-mono font-bold tracking-wider bg-grafite text-white rounded ${grande ? 'text-lg px-2 py-0.5' : 'text-xs px-1.5 py-0.5'}`}
    >
      {mascaraPlaca(placa)}
    </span>
  );
}

// Cartão de indicador (painel e telas financeiras).
export function Kpi({
  label,
  valor,
  sub,
  icon: Icon,
  cor = 'bg-fundo text-grafite/50',
}: {
  label: string;
  valor: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  cor?: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-linha shadow-sm relative min-w-0">
      {Icon && (
        <div className={`absolute top-4 right-4 w-11 h-11 rounded-xl grid place-items-center ${cor}`}>
          <Icon size={22} strokeWidth={2.2} />
        </div>
      )}
      <div className="text-[13px] text-grafite/50 font-semibold pr-12">{label}</div>
      <div className="text-2xl xl:text-3xl font-extrabold mt-2 leading-none tabular-nums">{valor}</div>
      {sub && <div className="text-xs mt-2 font-semibold text-grafite/50">{sub}</div>}
    </div>
  );
}

// Seletor de período (Hoje / 7 dias / Este mês / Mês passado / Tudo).
export function Periodo({ value, onChange }: { value: PeriodoKey; onChange: (k: PeriodoKey) => void }) {
  return (
    <div className="flex items-center gap-1 bg-white border border-linha rounded-xl p-1 overflow-x-auto" role="group" aria-label="Período">
      {PERIODOS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          aria-pressed={value === p.key}
          className={`px-3 py-1.5 rounded-lg text-sm font-bold transition whitespace-nowrap ${
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
        <p className="text-grafite/50 mt-1 text-sm">{children ?? 'Seu perfil não tem acesso a esta área.'}</p>
      </div>
    </div>
  );
}

/**
 * Falha ao carregar, dita na cara do usuário e com saída.
 * Tela vazia sem explicação é o pior estado possível no balcão.
 */
export function ErroAoCarregar({ erro, onTentar }: { erro: unknown; onTentar: () => void }) {
  return (
    <div className="grid place-items-center py-14 text-center">
      <div>
        <div className="w-14 h-14 rounded-2xl bg-vermelho-bg text-vermelho grid place-items-center mx-auto mb-3">
          <AlertTriangle size={26} strokeWidth={2} />
        </div>
        <div className="font-extrabold text-petroleo">Não consegui carregar</div>
        <p className="text-sm text-grafite/50 mt-1 max-w-sm">{mensagemDeErro(erro)}</p>
        <button onClick={onTentar} className="inline-flex items-center gap-2 mt-4 bg-petroleo hover:bg-petroleo/90 text-white font-bold px-4 py-2.5 rounded-xl">
          <RefreshCw size={15} /> Tentar de novo
        </button>
      </div>
    </div>
  );
}

export function Secao({ titulo, acao, children }: { titulo: ReactNode; acao?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <div className="text-xs font-bold text-grafite/55">{titulo}</div>
        <div className="flex-1" />
        {acao}
      </div>
      {children}
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="text-sm text-grafite/40 border border-dashed border-linha rounded-lg py-3 text-center">{children}</div>;
}

export function InfoLinha({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-bold text-grafite/40 uppercase tracking-wide">{rotulo}</div>
      <div className="font-semibold truncate">{valor || '—'}</div>
    </div>
  );
}
