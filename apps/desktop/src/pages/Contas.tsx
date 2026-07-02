import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { brl, dataBR } from '../lib/format';
import { PageHeader, Painel, Badge, Modal, Campo, BtnPrimary, BtnGhost, Kpi, Restrito, inputCls, thCls, tdCls, VazioOuCarregando } from '../components/ui';

interface Conta {
  id: string;
  parcela: number;
  totalParcelas: number;
  valor: number;
  vencimento: string;
  status: 'PENDENTE' | 'PAGA' | 'CANCELADA';
  emAtraso: boolean;
  cliente: { nome: string; telefone: string | null };
  os?: { numero: number } | null;
}
interface Totais {
  pendente: number;
  emAtraso: number;
}

export default function Contas() {
  const { usuario } = useAuth();
  const podeAcessar = usuario?.perfil !== 'MECANICO';
  const [contas, setContas] = useState<Conta[]>([]);
  const [totais, setTotais] = useState<Totais>({ pendente: 0, emAtraso: 0 });
  const [carregando, setCarregando] = useState(true);
  const [soAtrasadas, setSoAtrasadas] = useState(false);
  const [receber, setReceber] = useState<Conta | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const r = await api<{ contas: Conta[]; totais: Totais }>(`/contas-receber${soAtrasadas ? '?atrasadas=true' : ''}`);
      setContas(r.contas);
      setTotais(r.totais);
    } catch {
      /* 403 tratado pelo gate abaixo */
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    if (podeAcessar) carregar();
  }, [soAtrasadas, podeAcessar]);

  if (!podeAcessar) return <Restrito>Seu perfil não acessa contas a receber.</Restrito>;

  return (
    <div>
      <PageHeader title="Contas a Receber" subtitle="Fiados e parcelas em aberto">
        <label className="flex items-center gap-2 text-sm font-semibold text-grafite/70 cursor-pointer bg-white border border-linha rounded-xl px-3.5 py-2.5">
          <input type="checkbox" checked={soAtrasadas} onChange={(e) => setSoAtrasadas(e.target.checked)} className="w-4 h-4 accent-vermelho" />
          Só atrasadas
        </label>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Kpi label="A receber" valor={brl(totais.pendente)} icon="🧾" cor="bg-azul-bg text-azul" />
        <Kpi label="Em atraso" valor={brl(totais.emAtraso)} icon="⚠️" cor="bg-vermelho-bg text-vermelho" />
      </div>

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Cliente</th>
              <th className={thCls}>Origem</th>
              <th className={thCls}>Parcela</th>
              <th className={thCls}>Vencimento</th>
              <th className={`${thCls} text-right`}>Valor</th>
              <th className={thCls}>Situação</th>
              <th className={`${thCls} text-right`}>Ação</th>
            </tr>
          </thead>
          <tbody>
            <VazioOuCarregando carregando={carregando} vazio={contas.length === 0} colSpan={7} />
            {contas.map((c) => (
              <tr key={c.id} className="border-b border-fundo last:border-0 hover:bg-fundo/40 transition">
                <td className={`${tdCls} font-bold`}>
                  {c.cliente.nome}
                  {c.cliente.telefone && <div className="text-xs text-grafite/50 font-normal">{c.cliente.telefone}</div>}
                </td>
                <td className={`${tdCls} text-grafite/60`}>{c.os ? `OS #${c.os.numero}` : '—'}</td>
                <td className={`${tdCls} tabular-nums`}>{c.parcela}/{c.totalParcelas}</td>
                <td className={`${tdCls} whitespace-nowrap ${c.emAtraso ? 'text-vermelho font-bold' : 'text-grafite/60'}`}>{dataBR(c.vencimento)}</td>
                <td className={`${tdCls} text-right font-extrabold tabular-nums`}>{brl(c.valor)}</td>
                <td className={tdCls}>
                  {c.status === 'PAGA' ? (
                    <Badge cor="bg-verde-bg text-verde">Recebida</Badge>
                  ) : c.emAtraso ? (
                    <Badge cor="bg-vermelho-bg text-vermelho">Em atraso</Badge>
                  ) : (
                    <Badge cor="bg-amarelo-bg text-amarelo">Pendente</Badge>
                  )}
                </td>
                <td className={`${tdCls} text-right`}>
                  {c.status === 'PENDENTE' && (
                    <button onClick={() => setReceber(c)} className="text-verde font-bold hover:underline">
                      Receber
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Painel>

      {receber && <ReceberParcela conta={receber} onFechar={() => setReceber(null)} onSalvo={() => { setReceber(null); carregar(); }} />}
    </div>
  );
}

function ReceberParcela({ conta, onFechar, onSalvo }: { conta: Conta; onFechar: () => void; onSalvo: () => void }) {
  const [forma, setForma] = useState('A_VISTA');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function confirmar() {
    setSalvando(true);
    setErro('');
    try {
      await api(`/contas-receber/${conta.id}/receber`, { method: 'PATCH', body: { formaPagamento: forma } });
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Erro ao receber');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title="Receber parcela"
      onClose={onFechar}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary onClick={confirmar} disabled={salvando}>
            {salvando ? 'Recebendo...' : `Receber ${brl(conta.valor)}`}
          </BtnPrimary>
        </>
      }
    >
      <div className="bg-fundo rounded-xl p-4 text-sm">
        <div className="font-bold text-petroleo">{conta.cliente.nome}</div>
        <div className="text-grafite/60">
          Parcela {conta.parcela}/{conta.totalParcelas}
          {conta.os ? ` · OS #${conta.os.numero}` : ''} · vence {dataBR(conta.vencimento)}
        </div>
        <div className="text-2xl font-extrabold text-verde mt-2">{brl(conta.valor)}</div>
      </div>
      <Campo label="Forma de pagamento">
        <select value={forma} onChange={(e) => setForma(e.target.value)} className={inputCls}>
          <option value="A_VISTA">À vista</option>
          <option value="PIX">PIX</option>
          <option value="CARTAO">Cartão</option>
        </select>
      </Campo>
      {erro && <div className="text-vermelho text-sm">{erro}</div>}
    </Modal>
  );
}
