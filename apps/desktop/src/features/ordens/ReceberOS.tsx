import { useState } from 'react';
import { Plus, X, AlertTriangle } from 'lucide-react';
import {
  FORMAS_A_VISTA,
  LABEL_FORMA_PAGAMENTO,
  brl,
  dividirEmParcelas,
  somar,
  subtrair,
  type FormaAPrazo,
  type FormaAVista,
  type OrdemServicoDTO,
} from '@hermes/shared';
import { http } from '../../api/http';
import { useSessao } from '../acesso/sessao';
import { dataBR, daquiDias, hojeISO, somarMeses } from '../../lib/format';
import { BtnGhost, BtnPrimary, Campo, ErroFormulario, InputDinheiro, InputQuantidade, Marcador, Modal, inputCls } from '../../components/ui';
import { DINHEIRO, type AcaoNaOS } from './api';

// ============================================================
// Receber a OS (RN-11 / RN-11.1).
//
// O caso comum é um clique: o valor já vem preenchido, escolhe a
// forma e confirma. O caso difícil também cabe: parte no PIX, parte
// no dinheiro, e o resto fiado ou parcelado no crediário da oficina.
// O que é pago na hora entra no caixa já; o que fica a prazo vira
// parcela em Contas a Receber.
// ============================================================

interface Linha {
  forma: FormaAVista;
  valor: string;
}

const PRAZOS: { forma: FormaAPrazo; rotulo: string; ajuda: string }[] = [
  { forma: 'FIADO', rotulo: 'Fiado', ajuda: 'o cliente acerta depois' },
  { forma: 'PARCELADO', rotulo: 'Parcelado', ajuda: 'crediário da oficina' },
];

export function ReceberOS({ os, executar, onFechar }: { os: OrdemServicoDTO; executar: AcaoNaOS; onFechar: () => void }) {
  const { pode } = useSessao();
  const [linhas, setLinhas] = useState<Linha[]>([{ forma: 'PIX', valor: os.total.toFixed(2) }]);
  const [prazo, setPrazo] = useState<FormaAPrazo | null>(null);
  const [parcelas, setParcelas] = useState('1');
  const [vencimento, setVencimento] = useState(daquiDias(30));
  const podeEntregar = os.status === 'CONCLUIDA' && pode('atender');
  const [entregar, setEntregar] = useState(podeEntregar);
  const [clienteDeu, setClienteDeu] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const aVista = somar(...linhas.map((l) => Number(l.valor || 0)));
  const restante = subtrair(os.total, aVista);
  const nParcelas = Math.min(24, Math.max(1, Number(parcelas) || 1));
  const valoresParcelas = restante > 0 && prazo ? dividirEmParcelas(restante, nParcelas) : [];
  const emDinheiro = somar(...linhas.filter((l) => l.forma === 'A_VISTA').map((l) => Number(l.valor || 0)));
  const troco = clienteDeu ? subtrair(Number(clienteDeu), emDinheiro) : null;

  const mudarLinha = (i: number, parte: Partial<Linha>) => {
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...parte } : l)));
    setErro('');
  };

  function outraForma() {
    const usadas = new Set(linhas.map((l) => l.forma));
    const forma = FORMAS_A_VISTA.find((f) => !usadas.has(f)) ?? 'A_VISTA';
    setLinhas((ls) => [...ls, { forma, valor: restante > 0 ? restante.toFixed(2) : '' }]);
  }

  /** "Tudo a prazo": nada na hora, o total inteiro vira parcela. */
  function tudoAPrazo(forma: FormaAPrazo) {
    setLinhas([]);
    setPrazo(forma);
    setParcelas(forma === 'PARCELADO' ? '2' : '1');
  }

  async function enviar() {
    if (restante < 0) return setErro(`Os valores passam do total em ${brl(-restante)}.`);
    if (restante > 0 && !prazo) return setErro(`Faltam ${brl(restante)}: ajuste os valores ou lance o restante como fiado ou parcelado.`);
    if (restante > 0 && vencimento < hojeISO()) return setErro('O 1º vencimento não pode ser no passado.');

    const corpo = {
      pagamentos: linhas.filter((l) => Number(l.valor) > 0).map((l) => ({ forma: l.forma, valor: Number(l.valor) })),
      prazo: restante > 0 && prazo ? { forma: prazo, parcelas: nParcelas, primeiroVencimento: vencimento } : null,
    };

    setEnviando(true);
    try {
      const recebida = await executar((x) => http.post<OrdemServicoDTO>(`/ordens/${os.id}/receber`, { ...corpo, ...x }), {
        invalidar: DINHEIRO,
        sucesso: entregar ? undefined : 'Pagamento registrado.',
      });
      if (!recebida) return;
      if (entregar) {
        await executar(() => http.patch<OrdemServicoDTO>(`/ordens/${os.id}/status`, { status: 'ENTREGUE' }), {
          sucesso: 'Pagamento registrado e carro entregue.',
        });
      }
      onFechar();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      title={`Receber — OS #${os.numero}`}
      size="lg"
      onClose={onFechar}
      onEnviar={() => void enviar()}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Voltar</BtnGhost>
          <BtnPrimary type="submit" disabled={enviando}>
            {enviando ? 'Registrando...' : entregar ? 'Registrar e entregar o carro' : 'Registrar pagamento'}
          </BtnPrimary>
        </>
      }
    >
      <div className="flex items-end justify-between gap-3 bg-fundo rounded-xl px-4 py-3">
        <div>
          <div className="text-xs font-bold text-grafite/50">Total da OS</div>
          <div className="text-3xl font-extrabold text-petroleo tabular-nums">{brl(os.total)}</div>
        </div>
        <div className="text-right text-sm text-grafite/60">
          {os.cliente.nome}
          <div className="text-xs">{os.carro.modelo}</div>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-bold text-grafite/55">Pago agora</span>
          <div className="flex-1" />
          <span className="text-xs text-grafite/50">Tudo a prazo:</span>
          {PRAZOS.map((p) => (
            <button key={p.forma} type="button" onClick={() => tudoAPrazo(p.forma)} className="text-xs font-bold text-laranja hover:underline">
              {p.rotulo}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {linhas.length === 0 && <div className="text-sm text-grafite/45 border border-dashed border-linha rounded-lg py-2.5 text-center">Nada pago na hora.</div>}
          {linhas.map((l, i) => (
            <div key={i} className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <div className="flex bg-fundo rounded-lg p-1 gap-1" role="radiogroup" aria-label="Forma de pagamento">
                {FORMAS_A_VISTA.map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={l.forma === f}
                    onClick={() => mudarLinha(i, { forma: f })}
                    className={`px-3 py-1.5 rounded-md text-sm font-bold transition ${
                      l.forma === f ? 'bg-white text-petroleo shadow-sm' : 'text-grafite/55 hover:text-grafite'
                    }`}
                  >
                    {LABEL_FORMA_PAGAMENTO[f]}
                  </button>
                ))}
              </div>
              <div className="flex-1 min-w-[9rem]">
                <InputDinheiro value={l.valor} onChange={(v) => mudarLinha(i, { valor: v })} autoFocus={i === 0} />
              </div>
              <button
                type="button"
                onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}
                className="text-grafite/30 hover:text-vermelho p-1"
                aria-label="Tirar esta forma"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
        {linhas.length < 3 && (
          <button type="button" onClick={outraForma} className="mt-2 text-sm font-bold text-laranja inline-flex items-center gap-1 hover:underline">
            <Plus size={14} /> Dividir em outra forma
          </button>
        )}
        <p className="text-[11px] text-grafite/45 mt-1">Cartão parcelado na maquininha conta como Cartão: a oficina recebe da operadora.</p>
      </div>

      {emDinheiro > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <Campo label="Cliente entregou (dinheiro)" className="w-44">
            <InputDinheiro value={clienteDeu} onChange={setClienteDeu} />
          </Campo>
          {troco !== null && (
            <div className={`text-sm font-bold mt-5 ${troco < 0 ? 'text-vermelho' : 'text-verde'}`}>
              {troco < 0 ? `Faltam ${brl(-troco)}` : `Troco: ${brl(troco)}`}
            </div>
          )}
        </div>
      )}

      {restante < 0 && (
        <div className="flex items-center gap-2 text-sm font-bold text-vermelho bg-vermelho-bg/60 rounded-lg px-3 py-2">
          <AlertTriangle size={16} /> Os valores passam do total em {brl(-restante)}.
        </div>
      )}

      {restante > 0 && (
        <div className="border-[1.6px] border-amarelo/40 bg-amarelo-bg/40 rounded-xl p-3.5 space-y-3">
          <div className="text-sm font-bold text-petroleo">
            Faltam {brl(restante)} — como fica o restante?
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PRAZOS.map((p) => (
              <button
                key={p.forma}
                type="button"
                onClick={() => {
                  setPrazo(p.forma);
                  setParcelas(p.forma === 'PARCELADO' && nParcelas < 2 ? '2' : parcelas);
                  setErro('');
                }}
                aria-pressed={prazo === p.forma}
                className={`text-left border-[1.6px] rounded-lg px-3 py-2 transition ${
                  prazo === p.forma ? 'border-laranja bg-white' : 'border-linha bg-white/60 hover:bg-white'
                }`}
              >
                <div className="font-bold text-sm">{p.rotulo}</div>
                <div className="text-xs text-grafite/50">{p.ajuda}</div>
              </button>
            ))}
          </div>
          {prazo && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Parcelas">
                  <InputQuantidade value={parcelas} onChange={setParcelas} inteiro ariaLabel="Número de parcelas" />
                </Campo>
                <Campo label="1º vencimento">
                  <input type="date" value={vencimento} min={hojeISO()} onChange={(e) => setVencimento(e.target.value)} className={inputCls} />
                </Campo>
              </div>
              <div className="text-xs text-grafite/60 space-y-0.5">
                {valoresParcelas.map((v, i) => (
                  <div key={i} className="flex justify-between tabular-nums">
                    <span>
                      {i + 1}/{nParcelas} · vence {dataBR(somarMeses(vencimento, i))}
                    </span>
                    <span className="font-bold">{brl(v)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {podeEntregar && (
        <Marcador checked={entregar} onChange={setEntregar} ajuda="Marca a OS como entregue junto com o pagamento.">
          O cliente está levando o carro agora
        </Marcador>
      )}

      <ErroFormulario>{erro}</ErroFormulario>
    </Modal>
  );
}
