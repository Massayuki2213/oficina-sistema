import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { horaBR, diaLongoBR, LABEL_TIPO_VISITA, LABEL_STATUS_VISITA, CORES_STATUS_VISITA } from '../lib/format';
import { PageHeader, BtnPrimary, BtnGhost, Painel, Badge, Modal, Campo, inputCls } from '../components/ui';

interface Visita {
  id: string;
  dataHora: string;
  tipo: string;
  status: string;
  observacoes: string | null;
  cliente?: { nome: string; telefone: string | null };
  carro?: { placa: string; modelo: string } | null;
}

const FILTROS = [
  { key: 'hoje', label: 'Hoje' },
  { key: 'semana', label: '7 dias' },
  { key: 'mes', label: '30 dias' },
  { key: 'tudo', label: 'Tudo' },
] as const;
type FiltroKey = (typeof FILTROS)[number]['key'];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function rangeAgenda(key: FiltroKey): { de?: string; ate?: string } {
  const hoje = new Date();
  const de = ymd(hoje);
  if (key === 'tudo') return {};
  if (key === 'hoje') return { de, ate: de };
  const dias = key === 'semana' ? 6 : 29;
  const fim = new Date(hoje);
  fim.setDate(fim.getDate() + dias);
  return { de, ate: ymd(fim) };
}

export default function Agenda() {
  const [filtro, setFiltro] = useState<FiltroKey>('semana');
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [novo, setNovo] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const { de, ate } = rangeAgenda(filtro);
      const p = new URLSearchParams();
      if (de) p.set('de', de);
      if (ate) p.set('ate', ate);
      const qs = p.toString();
      setVisitas(await api<Visita[]>(`/agenda${qs ? `?${qs}` : ''}`));
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    carregar();
  }, [filtro]);

  async function setStatus(v: Visita, status: string) {
    setOcupado(v.id);
    try {
      await api(`/agenda/${v.id}/status`, { method: 'PATCH', body: { status } });
      await carregar();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Erro');
    } finally {
      setOcupado(null);
    }
  }
  async function excluir(v: Visita) {
    if (!confirm(`Cancelar o agendamento de ${v.cliente?.nome ?? 'cliente'}?`)) return;
    setOcupado(v.id);
    try {
      await api(`/agenda/${v.id}`, { method: 'DELETE' });
      await carregar();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Erro');
    } finally {
      setOcupado(null);
    }
  }

  // Agrupa por dia (local), preservando a ordem cronológica que vem da API.
  const grupos = useMemo(() => {
    const m = new Map<string, Visita[]>();
    for (const v of visitas) {
      const dia = ymd(new Date(v.dataHora));
      (m.get(dia) ?? m.set(dia, []).get(dia)!).push(v);
    }
    return [...m.entries()];
  }, [visitas]);

  return (
    <div>
      <PageHeader title="Agenda" subtitle={`${visitas.length} agendamento(s)`}>
        <div className="flex items-center gap-1 bg-white border border-linha rounded-xl p-1">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition ${
                filtro === f.key ? 'bg-petroleo text-white shadow-sm' : 'text-grafite/60 hover:bg-fundo'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <BtnPrimary onClick={() => setNovo(true)}>+ Novo agendamento</BtnPrimary>
      </PageHeader>

      {carregando ? (
        <div className="text-center text-grafite/40 py-16 text-sm">Carregando...</div>
      ) : visitas.length === 0 ? (
        <Painel>
          <div className="text-center py-16">
            <div className="text-5xl mb-3">📅</div>
            <div className="font-bold text-petroleo">Nenhum agendamento no período</div>
            <div className="text-grafite/50 text-sm mt-1">Clique em "Novo agendamento" para marcar uma visita.</div>
          </div>
        </Painel>
      ) : (
        <div className="space-y-6">
          {grupos.map(([dia, items]) => (
            <div key={dia}>
              <div className="flex items-center gap-3 mb-2 px-1">
                <h2 className="font-extrabold text-petroleo">{diaLongoBR(items[0].dataHora)}</h2>
                <span className="text-xs text-grafite/40 font-semibold">{items.length} agendamento(s)</span>
              </div>
              <Painel>
                <div className="divide-y divide-fundo">
                  {items.map((v) => (
                    <LinhaVisita key={v.id} v={v} ocupado={ocupado === v.id} onStatus={setStatus} onExcluir={excluir} />
                  ))}
                </div>
              </Painel>
            </div>
          ))}
        </div>
      )}

      {novo && <NovoAgendamento onFechar={() => setNovo(false)} onSalvo={() => { setNovo(false); carregar(); }} />}
    </div>
  );
}

function LinhaVisita({
  v,
  ocupado,
  onStatus,
  onExcluir,
}: {
  v: Visita;
  ocupado: boolean;
  onStatus: (v: Visita, s: string) => void;
  onExcluir: (v: Visita) => void;
}) {
  const acaoCls = 'text-xs font-bold px-2.5 py-1.5 rounded-lg transition disabled:opacity-40 whitespace-nowrap';
  const pendente = v.status === 'AGENDADA' || v.status === 'CONFIRMADA';
  return (
    <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-fundo/40 transition">
      <div className="w-14 text-center">
        <div className="text-lg font-extrabold text-petroleo tabular-nums leading-none">{horaBR(v.dataHora)}</div>
      </div>
      <div className="w-px self-stretch bg-linha" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold truncate">{v.cliente?.nome ?? '—'}</span>
          <Badge cor="bg-azul-bg text-azul">{LABEL_TIPO_VISITA[v.tipo] ?? v.tipo}</Badge>
        </div>
        <div className="text-xs text-grafite/50 mt-0.5">
          {v.carro ? (
            <>
              <span className="font-mono bg-grafite text-white px-1.5 py-0.5 rounded">{v.carro.placa}</span> {v.carro.modelo}
            </>
          ) : (
            <span className="text-grafite/30">sem veículo</span>
          )}
          {v.cliente?.telefone && <span> · {v.cliente.telefone}</span>}
        </div>
        {v.observacoes && <div className="text-xs text-grafite/40 mt-0.5 truncate">📝 {v.observacoes}</div>}
      </div>

      <Badge cor={CORES_STATUS_VISITA[v.status]}>{LABEL_STATUS_VISITA[v.status] ?? v.status}</Badge>

      <div className="flex items-center gap-1">
        {v.status === 'AGENDADA' && (
          <button onClick={() => onStatus(v, 'CONFIRMADA')} disabled={ocupado} className={`${acaoCls} text-verde hover:bg-verde-bg`}>
            Confirmar
          </button>
        )}
        {pendente && (
          <>
            <button onClick={() => onStatus(v, 'REALIZADA')} disabled={ocupado} className={`${acaoCls} text-petroleo hover:bg-fundo`}>
              Realizada
            </button>
            <button onClick={() => onStatus(v, 'FALTOU')} disabled={ocupado} className={`${acaoCls} text-vermelho hover:bg-vermelho-bg`}>
              Faltou
            </button>
          </>
        )}
        <button onClick={() => onExcluir(v)} disabled={ocupado} className="text-grafite/30 hover:text-vermelho text-lg px-1 disabled:opacity-40" title="Cancelar">
          ×
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
interface ClienteOpt { id: string; nome: string }
interface CarroOpt { id: string; placa: string; modelo: string; marca: string; clienteId: string }

function defaultDataHora() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  // formato aceito pelo <input type="datetime-local">
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T09:00`;
}

function NovoAgendamento({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const [clientes, setClientes] = useState<ClienteOpt[]>([]);
  const [carros, setCarros] = useState<CarroOpt[]>([]);
  const [form, setForm] = useState({ clienteId: '', carroId: '', dataHora: defaultDataHora(), tipo: 'REVISAO', observacoes: '' });
  const [erros, setErros] = useState<Record<string, string[]>>({});
  const [salvando, setSalvando] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api<ClienteOpt[]>('/clientes').then(setClientes).catch(() => {});
    api<CarroOpt[]>('/carros').then(setCarros).catch(() => {});
  }, []);

  const carrosDoCliente = useMemo(() => carros.filter((c) => c.clienteId === form.clienteId), [carros, form.clienteId]);

  async function salvar() {
    setSalvando(true);
    setErros({});
    try {
      await api('/agenda', { method: 'POST', body: form });
      onSalvo();
    } catch (err) {
      if (err instanceof ApiError) setErros(err.erros ?? { clienteId: [err.message] });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title="Novo agendamento"
      onClose={onFechar}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Agendar'}</BtnPrimary>
        </>
      }
    >
      <Campo label="Cliente" erro={erros.clienteId?.[0]}>
        <select value={form.clienteId} onChange={(e) => setForm((f) => ({ ...f, clienteId: e.target.value, carroId: '' }))} className={inputCls}>
          <option value="">Selecione...</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
      </Campo>
      <Campo label="Veículo (opcional)" erro={erros.carroId?.[0]}>
        <select value={form.carroId} onChange={(e) => set('carroId', e.target.value)} disabled={!form.clienteId} className={inputCls}>
          <option value="">{form.clienteId ? 'Sem veículo específico' : 'Escolha o cliente primeiro'}</option>
          {carrosDoCliente.map((c) => (
            <option key={c.id} value={c.id}>{c.placa} — {c.marca} {c.modelo}</option>
          ))}
        </select>
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Data e hora" erro={erros.dataHora?.[0]}>
          <input type="datetime-local" value={form.dataHora} onChange={(e) => set('dataHora', e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Tipo">
          <select value={form.tipo} onChange={(e) => set('tipo', e.target.value)} className={inputCls}>
            <option value="REVISAO">Revisão</option>
            <option value="RETORNO">Retorno</option>
            <option value="ORCAMENTO">Orçamento</option>
            <option value="GARANTIA">Garantia</option>
          </select>
        </Campo>
      </div>
      <Campo label="Observações">
        <input value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} placeholder="Opcional" className={inputCls} />
      </Campo>
    </Modal>
  );
}
