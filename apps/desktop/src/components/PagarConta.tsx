import { useState, type ReactNode } from 'react';
import { FORMAS_SAIDA, LABEL_FORMA_PAGAMENTO, brl, type FormaSaida } from '@hermes/shared';
import { hojeISO } from '../lib/format';
import { BtnGhost, BtnPrimary, Campo, ErroFormulario, Modal, inputCls } from './ui';
import { mensagemDeErro } from '../api/http';

/**
 * Pagar uma conta da oficina (compra de distribuidor, despesa): o valor
 * sai do caixa com a forma escolhida — é o que se confere no fechamento.
 */
export function PagarConta({
  titulo,
  valor,
  children,
  formaPadrao = 'PIX',
  comData,
  onConfirmar,
  onFechar,
}: {
  titulo: string;
  valor: number;
  children?: ReactNode;
  formaPadrao?: FormaSaida;
  /** Pergunta a data do pagamento (despesa paga em outro dia). */
  comData?: boolean;
  onConfirmar: (forma: FormaSaida, data: string | null) => Promise<unknown>;
  onFechar: () => void;
}) {
  const [forma, setForma] = useState<FormaSaida>(formaPadrao);
  const [data, setData] = useState(hojeISO());
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function pagar() {
    setEnviando(true);
    setErro('');
    try {
      await onConfirmar(forma, comData ? data : null);
      onFechar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      title={titulo}
      onClose={onFechar}
      onEnviar={() => void pagar()}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Voltar</BtnGhost>
          <BtnPrimary type="submit" disabled={enviando}>
            {enviando ? 'Pagando...' : `Pagar ${brl(valor)}`}
          </BtnPrimary>
        </>
      }
    >
      {children && <div className="text-sm text-grafite/65 leading-snug">{children}</div>}
      <Campo label="Como foi pago">
        <div className="grid grid-cols-2 sm:grid-cols-4 bg-fundo rounded-lg p-1 gap-1" role="radiogroup" aria-label="Forma de pagamento">
          {FORMAS_SAIDA.map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={forma === f}
              onClick={() => setForma(f)}
              className={`px-2 py-2 rounded-md text-sm font-bold transition ${forma === f ? 'bg-white text-petroleo shadow-sm' : 'text-grafite/55 hover:text-grafite'}`}
            >
              {LABEL_FORMA_PAGAMENTO[f]}
            </button>
          ))}
        </div>
      </Campo>
      {comData && (
        <Campo label="Data do pagamento">
          <input type="date" value={data} max={hojeISO()} onChange={(e) => setData(e.target.value)} className={inputCls} />
        </Campo>
      )}
      <ErroFormulario>{erro}</ErroFormulario>
    </Modal>
  );
}
