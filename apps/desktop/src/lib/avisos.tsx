import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

// ============================================================
// Avisos (Fase 5) — substituem alert() e confirm() do navegador.
//  · toast: sucesso / erro / info, some sozinho
//  · confirmar(): pergunta em modal e devolve true/false (await)
// ============================================================

type Tipo = 'sucesso' | 'erro' | 'info';
interface Toast {
  id: number;
  tipo: Tipo;
  texto: string;
}
interface Pergunta {
  titulo: string;
  mensagem: ReactNode;
  botao?: string;
  perigo?: boolean;
}

interface Avisos {
  sucesso: (texto: string) => void;
  erro: (texto: string) => void;
  info: (texto: string) => void;
  confirmar: (pergunta: Pergunta) => Promise<boolean>;
}

const AvisosCtx = createContext<Avisos | null>(null);

export function useAvisos() {
  const ctx = useContext(AvisosCtx);
  if (!ctx) throw new Error('useAvisos precisa estar dentro do <AvisosProvider>');
  return ctx;
}

const ESTILO: Record<Tipo, { cor: string; barra: string; Icone: typeof Info }> = {
  sucesso: { cor: 'text-verde', barra: 'bg-verde', Icone: CheckCircle2 },
  erro: { cor: 'text-vermelho', barra: 'bg-vermelho', Icone: AlertTriangle },
  info: { cor: 'text-azul', barra: 'bg-azul', Icone: Info },
};

// Erro fica mais tempo na tela: o usuário precisa ler o que deu errado.
const DURACAO: Record<Tipo, number> = { sucesso: 4000, info: 5000, erro: 7000 };

export function AvisosProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pergunta, setPergunta] = useState<(Pergunta & { responder: (ok: boolean) => void }) | null>(null);
  const proximoId = useRef(1);

  const fechar = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const mostrar = useCallback(
    (tipo: Tipo, texto: string) => {
      const id = proximoId.current++;
      setToasts((t) => [...t, { id, tipo, texto }]);
      setTimeout(() => fechar(id), DURACAO[tipo]);
    },
    [fechar],
  );

  const valor = useMemo<Avisos>(
    () => ({
      sucesso: (texto) => mostrar('sucesso', texto),
      erro: (texto) => mostrar('erro', texto),
      info: (texto) => mostrar('info', texto),
      confirmar: (p) => new Promise<boolean>((responder) => setPergunta({ ...p, responder })),
    }),
    [mostrar],
  );

  const responder = (ok: boolean) => {
    pergunta?.responder(ok);
    setPergunta(null);
  };

  return (
    <AvisosCtx.Provider value={valor}>
      {children}

      {/* Pilha de avisos — canto inferior direito, acima de tudo. */}
      <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2.5 w-[min(23rem,calc(100vw-2.5rem))]">
        {toasts.map((t) => {
          const { cor, barra, Icone } = ESTILO[t.tipo];
          return (
            <div
              key={t.id}
              role="status"
              className="flex items-start gap-3 bg-white rounded-xl border border-linha shadow-lg overflow-hidden animate-[surgir_.18s_ease-out]"
            >
              <div className={`w-1.5 self-stretch shrink-0 ${barra}`} />
              <Icone size={19} className={`${cor} shrink-0 mt-3`} />
              <p className="flex-1 text-sm font-semibold text-petroleo py-3 pr-1 leading-snug">{t.texto}</p>
              <button
                onClick={() => fechar(t.id)}
                aria-label="Fechar aviso"
                className="text-grafite/30 hover:text-grafite p-3 shrink-0"
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Confirmação — mesma cara do resto do sistema, sem pop-up do navegador. */}
      {pergunta && (
        <div className="fixed inset-0 bg-petroleo/50 grid place-items-center p-5 z-[70]" onClick={() => responder(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 flex gap-3.5">
              <div
                className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 ${
                  pergunta.perigo ? 'bg-vermelho-bg text-vermelho' : 'bg-amarelo-bg text-amarelo'
                }`}
              >
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-petroleo leading-tight">{pergunta.titulo}</h3>
                <div className="text-sm text-grafite/60 mt-1.5 leading-snug">{pergunta.mensagem}</div>
              </div>
            </div>
            <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-linha">
              <button
                onClick={() => responder(false)}
                className="px-4 py-2.5 rounded-xl border-[1.6px] border-linha font-bold text-petroleo hover:bg-fundo transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => responder(true)}
                autoFocus
                className={`px-4 py-2.5 rounded-xl font-bold text-white shadow-md transition ${
                  pergunta.perigo
                    ? 'bg-vermelho hover:brightness-95 shadow-vermelho/25'
                    : 'bg-laranja hover:bg-laranja-deep shadow-laranja/25'
                }`}
              >
                {pergunta.botao ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AvisosCtx.Provider>
  );
}
