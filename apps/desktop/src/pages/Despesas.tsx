import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { brl, dataBR } from '../lib/format';
import { queryPeriodo, type PeriodoKey } from '../lib/periodo';
import { PageHeader, Painel, Badge, Modal, Campo, BtnPrimary, BtnGhost, Kpi, Periodo, Restrito, inputCls, thCls, tdCls, VazioOuCarregando } from '../components/ui';

interface Despesa {
  id: string;
  categoria: string;
  descricao: string;
  valor: number;
  data: string;
  pago: boolean;
  recorrente: boolean;
  fornecedor?: { nome: string } | null;
}
interface Totais {
  total: number;
  pago: number;
  aPagar: number;
}

export default function Despesas() {
  const { podeVerFinanceiro } = useAuth();
  const [periodo, setPeriodo] = useState<PeriodoKey>('mes');
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [totais, setTotais] = useState<Totais>({ total: 0, pago: 0, aPagar: 0 });
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const r = await api<{ despesas: Despesa[]; totais: Totais }>(`/despesas${queryPeriodo(periodo)}`);
      setDespesas(r.despesas);
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

  async function pagar(d: Despesa) {
    if (!confirm(`Confirmar pagamento de "${d.descricao}" (${brl(d.valor)})? Isso lança a saída no caixa.`)) return;
    setOcupado(d.id);
    try {
      await api(`/despesas/${d.id}/pagar`, { method: 'PATCH' });
      await carregar();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Erro ao pagar');
    } finally {
      setOcupado(null);
    }
  }

  async function excluir(d: Despesa) {
    if (!confirm(`Excluir a despesa "${d.descricao}"?`)) return;
    setOcupado(d.id);
    try {
      await api(`/despesas/${d.id}`, { method: 'DELETE' });
      await carregar();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Erro ao excluir');
    } finally {
      setOcupado(null);
    }
  }

  if (!podeVerFinanceiro) return <Restrito>As Despesas são exclusivas do Dono.</Restrito>;

  return (
    <div>
      <PageHeader title="Despesas" subtitle="Contas e custos da oficina">
        <Periodo value={periodo} onChange={setPeriodo} />
        <BtnPrimary onClick={() => setModal(true)}>+ Nova despesa</BtnPrimary>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Kpi label="Total no período" valor={brl(totais.total)} icon="📉" cor="bg-fundo text-grafite/50" />
        <Kpi label="Já pago" valor={brl(totais.pago)} icon="✓" cor="bg-verde-bg text-verde" />
        <Kpi label="A pagar" valor={brl(totais.aPagar)} icon="⏳" cor="bg-amarelo-bg text-amarelo" />
      </div>

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Data</th>
              <th className={thCls}>Descrição</th>
              <th className={thCls}>Categoria</th>
              <th className={`${thCls} text-right`}>Valor</th>
              <th className={thCls}>Situação</th>
              <th className={`${thCls} text-right`}>Ações</th>
            </tr>
          </thead>
          <tbody>
            <VazioOuCarregando carregando={carregando} vazio={despesas.length === 0} colSpan={6} />
            {despesas.map((d) => (
              <tr key={d.id} className="border-b border-fundo last:border-0 hover:bg-fundo/40 transition">
                <td className={`${tdCls} text-grafite/60 whitespace-nowrap`}>{dataBR(d.data)}</td>
                <td className={`${tdCls} font-bold`}>
                  {d.descricao}
                  {d.recorrente && <span className="ml-2 text-[10px] font-bold text-azul">↻ recorrente</span>}
                  {d.fornecedor?.nome && <div className="text-xs text-grafite/50 font-normal">{d.fornecedor.nome}</div>}
                </td>
                <td className={tdCls}><Badge>{d.categoria}</Badge></td>
                <td className={`${tdCls} text-right font-extrabold tabular-nums`}>{brl(d.valor)}</td>
                <td className={tdCls}>
                  {d.pago ? <Badge cor="bg-verde-bg text-verde">Pago</Badge> : <Badge cor="bg-amarelo-bg text-amarelo">Pendente</Badge>}
                </td>
                <td className={`${tdCls} text-right whitespace-nowrap`}>
                  {!d.pago && (
                    <>
                      <button onClick={() => pagar(d)} disabled={ocupado === d.id} className="text-verde font-bold hover:underline disabled:opacity-50 mr-3">
                        Pagar
                      </button>
                      <button onClick={() => excluir(d)} disabled={ocupado === d.id} className="text-grafite/40 hover:text-vermelho disabled:opacity-50" title="Excluir">
                        🗑
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Painel>

      {modal && <NovaDespesa onFechar={() => setModal(false)} onSalvo={() => { setModal(false); carregar(); }} />}
    </div>
  );
}

function NovaDespesa({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const [form, setForm] = useState({ categoria: '', descricao: '', valor: '', data: '', recorrente: false, pago: false });
  const [erros, setErros] = useState<Record<string, string[]>>({});
  const [salvando, setSalvando] = useState(false);
  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function salvar() {
    setSalvando(true);
    setErros({});
    try {
      await api('/despesas', { method: 'POST', body: form });
      onSalvo();
    } catch (err) {
      if (err instanceof ApiError) setErros(err.erros ?? { descricao: [err.message] });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title="Nova despesa"
      onClose={onFechar}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar despesa'}
          </BtnPrimary>
        </>
      }
    >
      <Campo label="Descrição" erro={erros.descricao?.[0]}>
        <input value={form.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="Ex: Aluguel de junho" className={inputCls} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Categoria" erro={erros.categoria?.[0]}>
          <input value={form.categoria} onChange={(e) => set('categoria', e.target.value)} placeholder="Aluguel, energia..." className={inputCls} />
        </Campo>
        <Campo label="Valor (R$)" erro={erros.valor?.[0]}>
          <input type="number" step="0.01" value={form.valor} onChange={(e) => set('valor', e.target.value)} className={inputCls} />
        </Campo>
      </div>
      <Campo label="Vencimento" erro={erros.data?.[0]}>
        <input type="date" value={form.data} onChange={(e) => set('data', e.target.value)} className={inputCls} />
      </Campo>
      <div className="flex items-center gap-6 pt-1">
        <label className="flex items-center gap-2 text-sm font-semibold text-grafite/70 cursor-pointer">
          <input type="checkbox" checked={form.recorrente} onChange={(e) => set('recorrente', e.target.checked)} className="w-4 h-4 accent-laranja" />
          Recorrente
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-grafite/70 cursor-pointer">
          <input type="checkbox" checked={form.pago} onChange={(e) => set('pago', e.target.checked)} className="w-4 h-4 accent-verde" />
          Já está paga (lança no caixa)
        </label>
      </div>
    </Modal>
  );
}
