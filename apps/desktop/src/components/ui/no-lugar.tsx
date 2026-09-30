import { useRef, useState, type ReactNode } from 'react';
import { brl, formatarQtd } from '@hermes/shared';
import { numeroParaTexto, textoParaNumero } from '../../lib/mascaras';
import { InputDinheiro, InputQuantidade } from './formulario';

// ============================================================
// Edição no lugar: o valor vira campo ao clicar; Enter ou sair do
// campo salva, Esc desiste. Serve para o que muda com frequência
// numa tela que já está aberta (quantidade da peça na OS, preço
// combinado, desconto) sem abrir outra janela.
// ============================================================

/** A trava evita salvar duas vezes (o Enter e, logo depois, o blur do campo que some). */
function useEdicao(onSalvar: (texto: string) => unknown) {
  const [texto, setTexto] = useState<string | null>(null);
  const aberta = useRef(false);
  return {
    texto,
    setTexto,
    abrir: (inicial: string) => {
      aberta.current = true;
      setTexto(inicial);
    },
    confirmar: () => {
      if (!aberta.current || texto === null) return;
      aberta.current = false;
      setTexto(null);
      void onSalvar(texto);
    },
    desistir: () => {
      aberta.current = false;
      setTexto(null);
    },
  };
}

function Moldura({ className, ed, children }: { className: string; ed: ReturnType<typeof useEdicao>; children: ReactNode }) {
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        ed.confirmar();
      }}
      onBlur={ed.confirmar}
      // Esc aqui desiste da edição — não fecha a janela em volta.
      onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), ed.desistir())}
    >
      {children}
    </form>
  );
}

const botaoEditavel = 'rounded-lg py-1.5 tabular-nums text-sm border border-dashed border-linha hover:border-laranja';

export function QuantidadeNoLugar({
  valor,
  unidade,
  inteiro,
  editavel,
  onSalvar,
  className = 'w-20',
}: {
  valor: number;
  unidade?: string;
  inteiro?: boolean;
  editavel: boolean;
  onSalvar: (q: number) => unknown;
  className?: string;
}) {
  const ed = useEdicao((t) => {
    const q = textoParaNumero(t);
    if (q && q > 0 && q !== valor) return onSalvar(q);
  });

  if (!editavel || ed.texto === null) {
    return (
      <button
        type="button"
        disabled={!editavel}
        onClick={() => ed.abrir(numeroParaTexto(valor))}
        title={editavel ? 'Alterar a quantidade' : undefined}
        className={`${className} shrink-0 text-center ${editavel ? botaoEditavel : 'text-sm tabular-nums py-1.5'}`}
      >
        {formatarQtd(valor, unidade)}
      </button>
    );
  }
  return (
    <Moldura className={`${className} shrink-0`} ed={ed}>
      <InputQuantidade value={ed.texto} onChange={ed.setTexto} inteiro={inteiro} className="!py-1.5" ariaLabel="Nova quantidade" autoFocus />
    </Moldura>
  );
}

export function DinheiroNoLugar({
  valor,
  editavel = true,
  onSalvar,
  titulo = 'Alterar o valor',
  className = 'w-28',
  prefixo = '',
}: {
  valor: number;
  editavel?: boolean;
  onSalvar: (v: number) => unknown;
  titulo?: string;
  className?: string;
  /** Ex.: "−" antes do desconto. */
  prefixo?: string;
}) {
  const ed = useEdicao((t) => {
    const v = t === '' ? 0 : Number(t);
    if (v !== valor) return onSalvar(v);
  });

  if (!editavel || ed.texto === null) {
    return (
      <button
        type="button"
        disabled={!editavel}
        onClick={() => ed.abrir(valor ? valor.toFixed(2) : '')}
        title={editavel ? titulo : undefined}
        className={`${className} shrink-0 text-right px-2 ${editavel ? botaoEditavel : 'text-sm tabular-nums py-1.5'}`}
      >
        {prefixo}
        {brl(valor)}
      </button>
    );
  }
  return (
    <Moldura className={`${className} shrink-0 min-w-[8rem]`} ed={ed}>
      <InputDinheiro value={ed.texto} onChange={ed.setTexto} autoFocus />
    </Moldura>
  );
}
