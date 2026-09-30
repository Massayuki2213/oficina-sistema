import type { ReactNode } from 'react';
import { Pencil, Trash2, MessageCircle, type LucideIcon } from 'lucide-react';

// Botões do sistema — o mesmo visual em todas as telas.
// São type="button" por padrão: dentro de um <form>, o padrão do HTML
// seria "submit", e um "Cancelar" acabaria enviando o formulário.

interface PropsBotao {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  icone?: LucideIcon;
  titulo?: string;
  className?: string;
}

const base = 'inline-flex items-center justify-center gap-1.5 font-bold px-4 py-2.5 rounded-xl transition whitespace-nowrap disabled:opacity-55 disabled:cursor-not-allowed';

export function BtnPrimary({ children, onClick, disabled, type = 'button', icone: Icone, titulo, className = '' }: PropsBotao) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={titulo}
      className={`${base} bg-laranja hover:bg-laranja-deep text-white shadow-md shadow-laranja/25 ${className}`}
    >
      {Icone && <Icone size={16} />}
      {children}
    </button>
  );
}

export function BtnGhost({ children, onClick, disabled, type = 'button', icone: Icone, titulo, className = '' }: PropsBotao) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={titulo}
      className={`${base} border-[1.6px] border-linha text-petroleo hover:bg-fundo ${className}`}
    >
      {Icone && <Icone size={16} />}
      {children}
    </button>
  );
}

export function BtnPerigo({ children, onClick, disabled, type = 'button', icone: Icone, titulo, className = '' }: PropsBotao) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={titulo}
      className={`${base} border-[1.6px] border-vermelho/30 text-vermelho hover:bg-vermelho-bg ${className}`}
    >
      {Icone && <Icone size={16} />}
      {children}
    </button>
  );
}

/** Botão pequeno de ação de linha (tabela). */
export function BtnIcone({
  icone: Icone,
  titulo,
  onClick,
  disabled,
  perigo,
}: {
  icone: LucideIcon;
  titulo: string;
  onClick: () => void;
  disabled?: boolean;
  perigo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      title={titulo}
      aria-label={titulo}
      className={`p-1.5 rounded-lg hover:bg-fundo disabled:opacity-40 transition ${
        perigo ? 'text-grafite/40 hover:text-vermelho' : 'text-grafite/50 hover:text-petroleo'
      }`}
    >
      <Icone size={16} />
    </button>
  );
}

export const AcaoEditar = ({ onClick }: { onClick: () => void }) => <BtnIcone icone={Pencil} titulo="Editar" onClick={onClick} />;

export const AcaoExcluir = ({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) => (
  <BtnIcone icone={Trash2} titulo="Excluir" onClick={onClick} disabled={disabled} perigo />
);

/**
 * Abre o WhatsApp com a mensagem pronta. Sem telefone válido, não aparece —
 * melhor que um botão que não faz nada.
 */
export function BtnWhatsApp({
  href,
  children = 'WhatsApp',
  compacto,
  onClick,
}: {
  href: string | null;
  children?: ReactNode;
  compacto?: boolean;
  /** Algo a fazer junto (ex.: marcar o orçamento como enviado). */
  onClick?: () => void;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      title="Abrir no WhatsApp com a mensagem pronta"
      className={
        compacto
          ? 'inline-flex items-center gap-1 text-xs font-bold text-[#128C7E] hover:underline'
          : `${base} bg-[#25D366]/10 text-[#128C7E] hover:bg-[#25D366]/20`
      }
    >
      <MessageCircle size={compacto ? 13 : 16} />
      {children}
    </a>
  );
}
