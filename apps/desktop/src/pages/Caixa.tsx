import { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, Wallet } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAvisos } from '../lib/avisos';
import { brl, dataBR, LABEL_FORMA_PAGAMENTO } from '../lib/format';
import { queryPeriodo, type PeriodoKey } from '../lib/periodo';
import { PageHeader, Painel, Badge, Modal, Campo, BtnPrimary, BtnGhost, Kpi, Periodo, Restrito, InputDinheiro, inputCls, thCls, tdCls, VazioOuCarregando } from '../components/ui';

interface Lancamento {
  id: string;
  tipo: 'ENTRADA' | 'SAIDA';
  origem: string;
  descricao: string;
  valor: number;
  formaPagamento: string | null;
  categoria: string | null;
  data: string;
  usuario?: { nome: string };
}
interface Totais {
  entradas: number;
  saidas: number;
  saldo: number;
}

export default function Caixa() {
  const { podeVerFinanceiro } = useAuth();
  const avisos = useAvisos();
  const [periodo, setPeriodo] = useState<PeriodoKey>('mes');
  const [lancs, setLancs] = useState<Lancamento[]>([]);
  const [totais, setTotais] = useState<Totais>({ entradas: 0, saidas: 0, saldo: 0 });
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      const r = await api<{ lancamentos: Lancamento[]; totais: Totais }>(`/caixa${queryPeriodo(periodo)}`);
      setLancs(r.lancamentos);
      setTotais(r.totais);
    } catch {
      /* 403 tratado pelo gate abaixo */
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    if (podeVerFinanceiro) carregar();
  }, [periodo, podeVerFinanceiro]);

  if (!podeVerFinanceiro) return <Restrito>O Livro-Caixa é exclusivo do Dono.</Restrito>;

  return (
    <div>
      <PageHeader title="Livro-Caixa" subtitle="Tudo que entra e sai da oficina">
        <Periodo value={periodo} onChange={setPeriodo} />
        <BtnPrimary onClick={() => setModal(true)}>+ Lançamento</BtnPrimary>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Kpi label="Entradas" valor={brl(totais.entradas)} icon={ArrowUpRight} cor="bg-verde-bg text-verde" />
        <Kpi label="Saídas" valor={brl(totais.saidas)} icon={ArrowDownRight} cor="bg-vermelho-bg text-vermelho" />
        <Kpi
          label="Saldo do período"
          valor={brl(totais.saldo)}
          icon={Wallet}
          cor={totais.saldo >= 0 ? 'bg-verde-bg text-verde' : 'bg-vermelho-bg text-vermelho'}
        />
      </div>

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Data</th>
              <th className={thCls}>Descrição</th>
              <th className={thCls}>Categoria</th>
              <th className={thCls}>Forma</th>
              <th className={`${thCls} text-right`}>Valor</th>
            </tr>
          </thead>
          <tbody>
            <VazioOuCarregando carregando={carregando} vazio={lancs.length === 0} colSpan={5} />
            {lancs.map((l) => (
              <tr key={l.id} className="border-b border-fundo last:border-0 hover:bg-fundo/40 transition">
                <td className={`${tdCls} text-grafite/60 whitespace-nowrap`}>{dataBR(l.data)}</td>
                <td className={`${tdCls} font-bold`}>{l.descricao}</td>
                <td className={tdCls}>{l.categoria ? <Badge>{l.categoria}</Badge> : '—'}</td>
                <td className={`${tdCls} text-grafite/60`}>{l.formaPagamento ? LABEL_FORMA_PAGAMENTO[l.formaPagamento] ?? l.formaPagamento : '—'}</td>
                <td className={`${tdCls} text-right font-extrabold tabular-nums ${l.tipo === 'ENTRADA' ? 'text-verde' : 'text-vermelho'}`}>
                  {l.tipo === 'ENTRADA' ? '+' : '−'} {brl(l.valor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Painel>

      {modal && <NovoLancamento onFechar={() => setModal(false)} onSalvo={() => { setModal(false); avisos.sucesso('Lançamento registrado no caixa.'); carregar(); }} />}
    </div>
  );
}

function NovoLancamento({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const [form, setForm] = useState({ tipo: 'SAIDA', descricao: '', valor: '', formaPagamento: '', categoria: '' });
  const [erros, setErros] = useState<Record<string, string[]>>({});
  const [salvando, setSalvando] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const entrada = form.tipo === 'ENTRADA';

  async function salvar() {
    setSalvando(true);
    setErros({});
    try {
      // Entrada manual = aporte/venda avulsa; saída manual = sangria/despesa avulsa.
      await api('/caixa', { method: 'POST', body: { ...form, formaPagamento: entrada ? form.formaPagamento : '' } });
      onSalvo();
    } catch (err) {
      if (err instanceof ApiError) setErros(err.erros ?? { descricao: [err.message] });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title="Novo lançamento"
      onClose={onFechar}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Lançar'}
          </BtnPrimary>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => set('tipo', 'ENTRADA')}
          className={`py-2.5 rounded-lg font-bold text-sm border-[1.6px] transition inline-flex items-center justify-center gap-1.5 ${
            entrada ? 'border-verde bg-verde-bg text-verde' : 'border-linha text-grafite/50 hover:bg-fundo'
          }`}
        >
          <ArrowUpRight size={16} /> Entrada
        </button>
        <button
          onClick={() => set('tipo', 'SAIDA')}
          className={`py-2.5 rounded-lg font-bold text-sm border-[1.6px] transition inline-flex items-center justify-center gap-1.5 ${
            !entrada ? 'border-vermelho bg-vermelho-bg text-vermelho' : 'border-linha text-grafite/50 hover:bg-fundo'
          }`}
        >
          <ArrowDownRight size={16} /> Saída
        </button>
      </div>
      <Campo label="Descrição" erro={erros.descricao?.[0]}>
        <input value={form.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder={entrada ? 'Ex: Aporte do caixa' : 'Ex: Sangria / retirada'} className={inputCls} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Valor (R$)" erro={erros.valor?.[0]}>
          <InputDinheiro value={form.valor} onChange={(v) => set('valor', v)} />
        </Campo>
        <Campo label="Categoria">
          <input value={form.categoria} onChange={(e) => set('categoria', e.target.value)} placeholder="Opcional" className={inputCls} />
        </Campo>
      </div>
      {entrada && (
        <Campo label="Forma de pagamento">
          <select value={form.formaPagamento} onChange={(e) => set('formaPagamento', e.target.value)} className={inputCls}>
            <option value="">—</option>
            <option value="A_VISTA">À vista</option>
            <option value="PIX">PIX</option>
            <option value="CARTAO">Cartão</option>
          </select>
        </Campo>
      )}
    </Modal>
  );
}
