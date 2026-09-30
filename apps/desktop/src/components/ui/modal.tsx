import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useAvisos } from '../../lib/avisos';

/**
 * Janela de formulário do sistema.
 *
 * Além de aparecer, ela cuida do atrito de quem usa o dia inteiro:
 *  - **Enter envia** (passe `onEnviar`) — no balcão a mão não larga o teclado;
 *  - **ESC fecha**; o **Tab não escapa** da janela;
 *  - **o primeiro campo já vem focado**, então dá para sair digitando;
 *  - **a página de trás não rola** junto;
 *  - **clicar fora não joga trabalho fora**: se já houve digitação, pergunta
 *    antes de descartar. Perder um orçamento montado pela metade por um clique
 *    torto era o erro mais caro da tela.
 */
export function Modal({
  title,
  onClose,
  children,
  footer,
  size = 'md',
  onEnviar,
  semConfirmarDescarte,
  semFocoInicial,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
  /** Quando informado, o conteúdo vira <form> e Enter dispara esta função. */
  onEnviar?: () => void;
  /** Janelas só de leitura: fechar nunca pergunta. */
  semConfirmarDescarte?: boolean;
  /** Janela de consulta: não põe o cursor no primeiro campo (abriria uma busca sem ninguém pedir). */
  semFocoInicial?: boolean;
}) {
  const largura = size === 'xl' ? 'max-w-4xl' : size === 'lg' ? 'max-w-2xl' : 'max-w-md';
  const avisos = useAvisos();
  const caixa = useRef<HTMLDivElement>(null);
  const alterado = useRef(false);
  const tituloId = useId();

  // Foco no primeiro campo + trava da rolagem de trás, enquanto a janela existe.
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focoAntes = document.activeElement as HTMLElement | null;

    if (semFocoInicial) {
      caixa.current?.focus();
    } else {
      const primeiro = caixa.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled])',
      );
      primeiro?.focus();
      if (primeiro instanceof HTMLInputElement && primeiro.type !== 'checkbox') primeiro.select();
    }

    return () => {
      document.body.style.overflow = anterior;
      focoAntes?.focus?.();
    };
    // Só na abertura da janela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Só pergunta se houve digitação — confirmar à toa também irrita. */
  const fecharComCuidado = useCallback(async () => {
    if (!alterado.current || semConfirmarDescarte) return onClose();
    const ok = await avisos.confirmar({
      titulo: 'Descartar o que você preencheu?',
      mensagem: 'Você digitou algo nesta janela. Fechar agora perde o que não foi salvo.',
      botao: 'Descartar',
      perigo: true,
    });
    if (ok) onClose();
  }, [avisos, onClose, semConfirmarDescarte]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      // Uma janela por cima desta (confirmação) está com o foco e cuida do próprio ESC.
      const focoAqui = document.activeElement === document.body || !!caixa.current?.contains(document.activeElement);
      if (e.key === 'Escape' && focoAqui) void fecharComCuidado();
      // Prende o Tab dentro da janela.
      if (e.key === 'Tab' && caixa.current) {
        const focaveis = caixa.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focaveis.length === 0) return;
        const primeiro = focaveis[0];
        const ultimo = focaveis[focaveis.length - 1];
        if (e.shiftKey && document.activeElement === primeiro) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primeiro.focus();
        }
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [fecharComCuidado]);

  const corpo = (
    <>
      <div className="p-5 sm:p-6 space-y-3.5">{children}</div>
      {footer && <div className="flex flex-wrap justify-end gap-2.5 px-5 sm:px-6 py-4 border-t border-linha">{footer}</div>}
    </>
  );

  // Portal no <body>: uma janela aberta de dentro de outra (cadastrar o cliente
  // sem sair da OS) fica por cima, e o ESC fecha só a de cima.
  return createPortal(
    <div className="nao-imprimir fixed inset-0 bg-petroleo/50 grid place-items-center p-3 sm:p-5 z-50" onMouseDown={() => void fecharComCuidado()}>
      <div
        ref={caixa}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className={`bg-white rounded-2xl w-full ${largura} max-h-[92vh] overflow-y-auto shadow-2xl outline-none`}
        onMouseDown={(e) => e.stopPropagation()}
        // Qualquer digitação marca a janela como suja, sem cada formulário
        // ter que avisar — um `onInput` que sobe é mais confiável que 20 flags.
        onInput={() => {
          alterado.current = true;
        }}
      >
        <div className="sticky top-0 z-10 bg-white flex items-center gap-3 px-5 sm:px-6 py-4 border-b border-linha">
          <h3 id={tituloId} className="text-lg font-extrabold text-petroleo min-w-0 flex-1">
            {title}
          </h3>
          <button
            type="button"
            onClick={() => void fecharComCuidado()}
            aria-label="Fechar"
            className="text-grafite/40 hover:text-grafite w-8 h-8 grid place-items-center rounded-lg hover:bg-fundo shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {onEnviar ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onEnviar();
            }}
          >
            {/* Os botões visíveis são type="button"; sem um submit o Enter não
                dispararia o envio implícito do formulário. Este existe só p/ isso. */}
            <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
            {corpo}
          </form>
        ) : (
          corpo
        )}
      </div>
    </div>,
    document.body,
  );
}
