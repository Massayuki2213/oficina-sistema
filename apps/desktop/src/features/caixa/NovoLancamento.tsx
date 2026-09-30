import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FORMAS_SAIDA, LABEL_FORMA_PAGAMENTO, type FormaSaida, type LancamentoDTO, type TipoLancamento } from '@hermes/shared';
import { ApiError, http, mensagemDeErro } from '../../api/http';
import { useAvisos } from '../../lib/avisos';
import { hojeISO } from '../../lib/format';
import { BtnGhost, BtnPrimary, Campo, ErroFormulario, InputDinheiro, Modal, Selecao, inputCls } from '../../components/ui';

type Origem = 'APORTE' | 'VENDA_BALCAO' | 'RETIRADA' | 'DESPESA';

// A origem diz o que o dinheiro É — e isso muda o lucro do relatório.
const ORIGENS: Record<TipoLancamento, { valor: Origem; rotulo: string; ajuda: string }[]> = {
  ENTRADA: [
    { valor: 'APORTE', rotulo: 'Aporte do dono', ajuda: 'Dinheiro que o dono colocou. Não conta como faturamento.' },
    { valor: 'VENDA_BALCAO', rotulo: 'Venda avulsa', ajuda: 'Receita sem OS nem venda de peça (ex.: serviço rápido). Conta como faturamento.' },
  ],
  SAIDA: [
    { valor: 'DESPESA', rotulo: 'Despesa miúda', ajuda: 'Gasto da oficina pago na hora (café, material de limpeza). Entra nas despesas.' },
    { valor: 'RETIRADA', rotulo: 'Retirada do dono', ajuda: 'Dinheiro que o dono tirou (pró-labore). Não é despesa da oficina.' },
  ],
};

export function NovoLancamento({ onFechar }: { onFechar: () => void }) {
  const qc = useQueryClient();
  const avisos = useAvisos();
  const [tipo, setTipo] = useState<TipoLancamento>('SAIDA');
  const [origem, setOrigem] = useState<Origem>('DESPESA');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [forma, setForma] = useState<FormaSaida>('A_VISTA');
  const [categoria, setCategoria] = useState('');
  const [data, setData] = useState(hojeISO());
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  function mudarTipo(t: TipoLancamento) {
    setTipo(t);
    setOrigem(ORIGENS[t][0].valor);
  }

  async function salvar() {
    setEnviando(true);
    setErros({});
    try {
      await http.post<LancamentoDTO>('/caixa', {
        tipo,
        origem,
        descricao: descricao.trim(),
        valor: Number(valor || 0),
        formaPagamento: forma,
        categoria: origem === 'DESPESA' ? categoria.trim() || null : null,
        data,
      });
      await Promise.all([['caixa'], ['relatorios'], ['despesas']].map((queryKey) => qc.invalidateQueries({ queryKey })));
      avisos.sucesso('Lançamento registrado.');
      onFechar();
    } catch (e) {
      if (e instanceof ApiError && e.erros) setErros(Object.fromEntries(Object.entries(e.erros).map(([k, v]) => [k, v[0]])));
      else setErros({ geral: mensagemDeErro(e) });
    } finally {
      setEnviando(false);
    }
  }

  const escolhida = ORIGENS[tipo].find((o) => o.valor === origem);

  return (
    <Modal
      title="Lançamento manual no caixa"
      onClose={onFechar}
      onEnviar={() => void salvar()}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary type="submit" disabled={enviando}>
            {enviando ? 'Salvando...' : 'Lançar'}
          </BtnPrimary>
        </>
      }
    >
      <div className="grid grid-cols-2 bg-fundo rounded-lg p-1 gap-1" role="radiogroup" aria-label="Tipo">
        {(['ENTRADA', 'SAIDA'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tipo === t}
            onClick={() => mudarTipo(t)}
            className={`px-3 py-2 rounded-md text-sm font-bold transition ${
              tipo === t ? `bg-white shadow-sm ${t === 'ENTRADA' ? 'text-verde' : 'text-vermelho'}` : 'text-grafite/55'
            }`}
          >
            {t === 'ENTRADA' ? 'Entrou dinheiro' : 'Saiu dinheiro'}
          </button>
        ))}
      </div>
      <Campo label="O que é" erro={erros.origem} ajuda={escolhida?.ajuda}>
        <Selecao value={origem} onChange={(e) => setOrigem(e.target.value as Origem)}>
          {ORIGENS[tipo].map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Campo label="Descrição" erro={erros.descricao}>
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inputCls} maxLength={200} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Valor" erro={erros.valor}>
          <InputDinheiro value={valor} onChange={setValor} />
        </Campo>
        <Campo label="Data" erro={erros.data}>
          <input type="date" value={data} max={hojeISO()} onChange={(e) => setData(e.target.value)} className={inputCls} />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Forma">
          <Selecao value={forma} onChange={(e) => setForma(e.target.value as FormaSaida)}>
            {FORMAS_SAIDA.map((f) => (
              <option key={f} value={f}>
                {LABEL_FORMA_PAGAMENTO[f]}
              </option>
            ))}
          </Selecao>
        </Campo>
        {origem === 'DESPESA' && (
          <Campo label="Categoria" erro={erros.categoria}>
            <input value={categoria} onChange={(e) => setCategoria(e.target.value)} className={inputCls} maxLength={60} placeholder="Ex.: Copa" />
          </Campo>
        )}
      </div>
      <p className="text-xs text-grafite/50">Contas com vencimento (aluguel, energia) ficam melhor em Despesas: dá para ver o que está para vencer.</p>
      <ErroFormulario>{erros.geral}</ErroFormulario>
    </Modal>
  );
}
