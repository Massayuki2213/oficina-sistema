import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Search, X, Loader2 } from 'lucide-react';
import { inputCls } from './formulario';

// ============================================================
// Escolher um item digitando (cliente, veículo, serviço, peça).
//
// Um <select> com a lista inteira funciona com 10 clientes e trava
// com 500. Aqui a busca é no servidor, enquanto a pessoa digita, e
// tudo funciona pelo teclado: ↑ ↓ para andar, Enter escolhe, Esc fecha.
// ============================================================

interface Props<T> {
  /** Item escolhido (null = nada). */
  valor: T | null;
  onChange: (item: T | null) => void;
  /** Busca no servidor. Recebe '' ao abrir sem digitar. */
  buscar: (termo: string) => Promise<T[]>;
  /** Parte da chave de cache (ex.: 'clientes'). */
  chave: string;
  rotulo: (item: T) => string;
  detalhe?: (item: T) => ReactNode;
  id: (item: T) => string;
  placeholder?: string;
  /** Ação no pé da lista (ex.: "+ Cadastrar novo cliente"). */
  rodape?: (termo: string, fechar: () => void) => ReactNode;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Modo "adicionar": escolheu, avisa e limpa (lista de itens do orçamento). */
  limparAoEscolher?: boolean;
  ariaLabel?: string;
}

export function BuscaSelect<T>({
  valor,
  onChange,
  buscar,
  chave,
  rotulo,
  detalhe,
  id,
  placeholder = 'Digite para buscar...',
  rodape,
  disabled,
  autoFocus,
  limparAoEscolher,
  ariaLabel,
}: Props<T>) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [termo, setTermo] = useState('');
  const [ativo, setAtivo] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const listaId = useId();

  useEffect(() => {
    const t = setTimeout(() => setTermo(texto.trim()), 250);
    return () => clearTimeout(t);
  }, [texto]);

  const consulta = useQuery({
    queryKey: [chave, 'busca', termo],
    queryFn: () => buscar(termo),
    enabled: aberto,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const itens = consulta.data ?? [];
  // A lista na tela é da busca que está digitada? (Enquanto a nova não
  // volta, a anterior continua visível — e o Enter não pode escolher dela.)
  const atualizada = termo === texto.trim() && !consulta.isPlaceholderData && !consulta.isFetching;
  const [enterNaEspera, setEnterNaEspera] = useState(false);

  useEffect(() => setAtivo(0), [termo]);

  // Clique fora fecha.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  function escolher(item: T) {
    onChange(item);
    setAberto(false);
    setTexto('');
    if (limparAoEscolher) setTimeout(() => campo.current?.focus(), 0);
  }

  const fechar = () => setAberto(false);

  // Enter apertado antes do resultado chegar (o leitor de código de barras
  // digita e aperta Enter em milissegundos): escolhe quando a busca certa voltar.
  useEffect(() => {
    if (!enterNaEspera || !atualizada) return;
    setEnterNaEspera(false);
    if (itens[0]) escolher(itens[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enterNaEspera, atualizada, itens]);

  // Escolhido (e não é o modo "adicionar"): mostra o item com um X para trocar.
  if (valor && !limparAoEscolher) {
    return (
      <div className={`${inputCls} flex items-center gap-2 ${disabled ? 'bg-fundo' : ''}`}>
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{rotulo(valor)}</div>
          {detalhe && <div className="text-xs text-grafite/50 truncate">{detalhe(valor)}</div>}
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setTimeout(() => campo.current?.focus(), 0);
            }}
            aria-label="Trocar"
            className="text-grafite/40 hover:text-grafite shrink-0"
          >
            <X size={16} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={caixa} className="relative">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-grafite/35 pointer-events-none" />
        <input
          ref={campo}
          value={texto}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          role="combobox"
          aria-label={ariaLabel ?? placeholder}
          aria-expanded={aberto}
          aria-controls={listaId}
          aria-autocomplete="list"
          onFocus={() => setAberto(true)}
          onChange={(e) => {
            setTexto(e.target.value);
            setAberto(true);
            setEnterNaEspera(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setAberto(true);
              setAtivo((a) => Math.min(a + 1, itens.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setAtivo((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              if (aberto && atualizada && itens[ativo]) {
                e.preventDefault();
                e.stopPropagation();
                escolher(itens[ativo]);
              } else if (texto.trim()) {
                e.preventDefault();
                e.stopPropagation();
                setAberto(true);
                setTermo(texto.trim()); // pula a espera da digitação
                setEnterNaEspera(true);
              }
            } else if (e.key === 'Escape' && aberto) {
              e.stopPropagation();
              setAberto(false);
            }
          }}
          className={`${inputCls} pl-9`}
        />
        {consulta.isFetching && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-grafite/35 animate-spin" />}
      </div>

      {aberto && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-linha rounded-xl shadow-xl overflow-hidden">
          <ul id={listaId} role="listbox" className="max-h-64 overflow-y-auto py-1">
            {itens.length === 0 && !consulta.isFetching && (
              <li className="px-3 py-3 text-sm text-grafite/45 text-center">{termo ? `Nada encontrado para "${termo}"` : 'Nada cadastrado ainda'}</li>
            )}
            {itens.map((item, i) => (
              <li
                key={id(item)}
                role="option"
                aria-selected={i === ativo}
                onMouseEnter={() => setAtivo(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolher(item);
                }}
                className={`px-3 py-2 cursor-pointer ${i === ativo ? 'bg-laranja/10' : ''}`}
              >
                <div className="text-sm font-semibold truncate">{rotulo(item)}</div>
                {detalhe && <div className="text-xs text-grafite/50 truncate">{detalhe(item)}</div>}
              </li>
            ))}
          </ul>
          {rodape && <div className="border-t border-linha bg-fundo/60">{rodape(texto, fechar)}</div>}
        </div>
      )}
    </div>
  );
}
