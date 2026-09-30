import { useState, type ReactNode } from 'react';
import { AreaTexto, BtnGhost, BtnPerigo, BtnPrimary, Campo, Modal } from './ui';

/**
 * Pede o motivo antes de uma ação que não se desfaz (cancelar OS, estornar
 * pagamento, cancelar venda). O motivo fica gravado — no histórico e na
 * própria OS —, então a pergunta "por que isso foi cancelado?" tem resposta.
 */
export function JanelaMotivo({
  titulo,
  children,
  rotulo = 'Motivo',
  botao,
  perigo = true,
  sugestoes = [],
  onConfirmar,
  onFechar,
}: {
  titulo: string;
  children?: ReactNode;
  rotulo?: string;
  botao: string;
  perigo?: boolean;
  /** Motivos comuns, um clique preenche. */
  sugestoes?: string[];
  onConfirmar: (motivo: string) => Promise<unknown>;
  onFechar: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function enviar() {
    if (!motivo.trim()) return setErro('Escreva o motivo — ele fica registrado.');
    setEnviando(true);
    try {
      await onConfirmar(motivo.trim());
    } finally {
      setEnviando(false);
    }
  }

  const Botao = perigo ? BtnPerigo : BtnPrimary;
  return (
    <Modal
      title={titulo}
      onClose={onFechar}
      onEnviar={() => void enviar()}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Voltar</BtnGhost>
          <Botao type="submit" disabled={enviando}>
            {enviando ? 'Aguarde...' : botao}
          </Botao>
        </>
      }
    >
      {children && <div className="text-sm text-grafite/70 leading-snug">{children}</div>}
      <Campo label={rotulo} erro={erro}>
        <AreaTexto
          value={motivo}
          maxLength={300}
          onChange={(e) => {
            setMotivo(e.target.value);
            setErro('');
          }}
        />
      </Campo>
      {sugestoes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sugestoes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setMotivo(s)}
              className="text-xs font-semibold px-2.5 py-1 rounded-full bg-fundo hover:bg-linha text-grafite/70"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
