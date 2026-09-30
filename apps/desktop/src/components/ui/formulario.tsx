import type { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { centavosParaTexto, soDigitos, textoParaCentavos, valorParaCentavos } from '../../lib/mascaras';

export const inputCls =
  'w-full px-3 py-2.5 border-[1.6px] border-linha rounded-lg outline-none focus:border-laranja bg-white disabled:bg-fundo disabled:text-grafite/50';

/**
 * Rótulo + campo.
 *
 * O <label> ENVOLVE o controle em vez de ficar ao lado dele: a ligação é
 * implícita, clicar no rótulo foca o campo e o leitor de tela anuncia o nome
 * certo — sem inventar um id em cada uma das chamadas.
 */
export function Campo({
  label,
  erro,
  ajuda,
  children,
  className = '',
}: {
  label: ReactNode;
  erro?: string;
  ajuda?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-bold text-grafite/55 mb-1.5">{label}</span>
      {children}
      {ajuda && !erro && <span className="block text-[11px] text-grafite/45 mt-1 leading-snug">{ajuda}</span>}
      {erro && <span className="block text-vermelho text-xs mt-1 font-semibold">{erro}</span>}
    </label>
  );
}

/**
 * Campo de dinheiro: o usuário digita só os números e vê "1.234,56";
 * o formulário continua guardando "1234.56".
 */
export function InputDinheiro({
  value,
  onChange,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const texto = value === '' ? '' : centavosParaTexto(valorParaCentavos(value));
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-grafite/40 pointer-events-none">R$</span>
      <input
        inputMode="numeric"
        value={texto}
        placeholder="0,00"
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(e) => {
          const digitado = e.target.value;
          if (!soDigitos(digitado)) return onChange('');
          onChange((textoParaCentavos(digitado) / 100).toFixed(2));
        }}
        className={`${inputCls} pl-10 text-right tabular-nums`}
      />
    </div>
  );
}

/** Quantidade que aceita fração com vírgula: "3,5" (litros, metros). */
export function InputQuantidade({
  value,
  onChange,
  inteiro,
  className = '',
  ariaLabel,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  inteiro?: boolean;
  className?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      inputMode="decimal"
      value={value}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      onChange={(e) => {
        const limpo = e.target.value.replace(inteiro ? /[^\d]/g : /[^\d,]/g, '');
        // Uma vírgula só, até 3 casas.
        const [int, dec] = limpo.split(',');
        onChange(dec !== undefined && !inteiro ? `${int},${dec.slice(0, 3)}` : int);
      }}
      className={`${inputCls} text-center tabular-nums ${className}`}
    />
  );
}

export function Selecao({ children, className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${inputCls} ${className}`}>
      {children}
    </select>
  );
}

export function AreaTexto({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`${inputCls} resize-y ${className}`} />;
}

export function Marcador({
  checked,
  onChange,
  children,
  ajuda,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  ajuda?: ReactNode;
}) {
  return (
    <label className="flex items-start gap-2.5 bg-fundo rounded-xl px-3.5 py-2.5 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 mt-0.5 accent-laranja" />
      <span className="text-sm font-semibold text-grafite">
        {children}
        {ajuda && <span className="block text-xs text-grafite/50 font-normal">{ajuda}</span>}
      </span>
    </label>
  );
}

/** Erro geral do formulário (o que não é de um campo só). */
export function ErroFormulario({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <div className="text-vermelho text-sm font-semibold bg-vermelho-bg/60 rounded-lg px-3 py-2">{children}</div>;
}
