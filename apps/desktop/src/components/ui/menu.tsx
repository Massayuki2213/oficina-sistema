import { useEffect, useRef, useState } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';

export interface ItemMenu {
  rotulo: string;
  icone: LucideIcon;
  onClick: () => void;
  perigo?: boolean;
  /** Some da lista quando falso (evita um monte de `cond && {...}` na chamada). */
  visivel?: boolean;
}

/**
 * "Mais ações": o que é raro (estornar, cancelar, garantia) sai da frente
 * sem sumir. Abre para cima por padrão — ele mora no rodapé das janelas.
 */
export function MenuMais({ itens, rotulo = 'Mais', paraBaixo }: { itens: ItemMenu[]; rotulo?: string; paraBaixo?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const visiveis = itens.filter((i) => i.visivel !== false);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  if (visiveis.length === 0) return null;
  return (
    <div
      ref={caixa}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && aberto) {
          e.stopPropagation();
          setAberto(false);
        }
      }}
    >
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        className="inline-flex items-center gap-1.5 font-bold px-4 py-2.5 rounded-xl border-[1.6px] border-linha text-petroleo hover:bg-fundo transition"
      >
        {rotulo} <ChevronDown size={15} className={`transition ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <div
          role="menu"
          className={`absolute left-0 z-30 min-w-[13rem] bg-white border border-linha rounded-xl shadow-xl py-1 ${
            paraBaixo ? 'top-full mt-2' : 'bottom-full mb-2'
          }`}
        >
          {visiveis.map(({ rotulo: r, icone: Icone, onClick, perigo }) => (
            <button
              key={r}
              type="button"
              role="menuitem"
              autoFocus={r === visiveis[0].rotulo}
              onClick={() => {
                setAberto(false);
                onClick();
              }}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm font-semibold text-left hover:bg-fundo focus:bg-fundo outline-none ${
                perigo ? 'text-vermelho' : 'text-petroleo'
              }`}
            >
              <Icone size={15} /> {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
