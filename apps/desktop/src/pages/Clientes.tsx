import { useEffect, useState } from 'react';
import { Pencil, AlertTriangle, Receipt, CheckCircle2, StickyNote } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { iniciais, dataBR, brl, LABEL_STATUS_OS, CORES_STATUS_OS } from '../lib/format';
import { PageHeader, SearchBar, BtnPrimary, BtnGhost, Painel, Badge, Modal, Campo, AcaoEditar, AcaoExcluir, inputCls, thCls, tdCls, VazioOuCarregando } from '../components/ui';

interface Cliente {
  id: string;
  nome: string;
  tipo: 'PF' | 'PJ';
  cpfCnpj: string | null;
  telefone: string | null;
  email: string | null;
  _count?: { carros: number };
}

export default function Clientes() {
  const { usuario } = useAuth();
  const ehDono = usuario?.perfil === 'DONO';
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState<Cliente | null>(null);
  const [ficha, setFicha] = useState<Cliente | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function carregar(termo = '') {
    setCarregando(true);
    try {
      setClientes(await api<Cliente[]>(termo ? `/clientes?busca=${encodeURIComponent(termo)}` : '/clientes'));
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    carregar();
  }, []);

  async function excluir(c: Cliente) {
    if (!confirm(`Excluir o cliente "${c.nome}"? Ele sai da lista (o histórico de OS é preservado).`)) return;
    setOcupado(c.id);
    try {
      await api(`/clientes/${c.id}`, { method: 'DELETE' });
      await carregar(busca);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Erro ao excluir');
    } finally {
      setOcupado(null);
    }
  }

  const fecharForm = () => { setNovo(false); setEditar(null); };
  const aposSalvar = () => { fecharForm(); carregar(busca); };

  return (
    <div>
      <PageHeader title="Clientes" subtitle={`${clientes.length} cliente(s)`}>
        <SearchBar value={busca} onChange={setBusca} onSubmit={() => carregar(busca)} placeholder="Nome, CPF ou telefone..." />
        <BtnPrimary onClick={() => setNovo(true)}>+ Novo cliente</BtnPrimary>
      </PageHeader>

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Cliente</th>
              <th className={thCls}>Tipo</th>
              <th className={thCls}>CPF / CNPJ</th>
              <th className={thCls}>Telefone</th>
              <th className={thCls}>Veículos</th>
              <th className={`${thCls} text-right`}>Ações</th>
            </tr>
          </thead>
          <tbody>
            <VazioOuCarregando carregando={carregando} vazio={clientes.length === 0} colSpan={6} />
            {clientes.map((c) => (
              <tr key={c.id} onClick={() => setFicha(c)} className="border-b border-fundo last:border-0 hover:bg-fundo/40 transition cursor-pointer">
                <td className={tdCls}>
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-full bg-petroleo text-white grid place-items-center text-xs font-bold">{iniciais(c.nome)}</span>
                    <span className="font-bold">{c.nome}</span>
                  </div>
                </td>
                <td className={tdCls}><Badge>{c.tipo}</Badge></td>
                <td className={`${tdCls} text-grafite/60`}>{c.cpfCnpj ?? '—'}</td>
                <td className={tdCls}>{c.telefone ?? '—'}</td>
                <td className={`${tdCls} font-semibold`}>{c._count?.carros ?? 0}</td>
                <td className={`${tdCls} text-right whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
                  <AcaoEditar onClick={() => setEditar(c)} />
                  {ehDono && <AcaoExcluir onClick={() => excluir(c)} disabled={ocupado === c.id} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Painel>

      {(novo || editar) && <FormCliente cliente={editar} onFechar={fecharForm} onSalvo={aposSalvar} />}
      {ficha && (
        <FichaCliente
          clienteId={ficha.id}
          onFechar={() => setFicha(null)}
          onEditar={() => { setEditar(ficha); setFicha(null); }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Ficha do cliente: dados, veículos, fiado e histórico de OS (RN-16/17).
// ------------------------------------------------------------------
interface CarroFicha { id: string; placa: string; marca: string; modelo: string; ano: number | null; kmAtual: number | null }
interface OSFicha { id: string; numero: number; dataAbertura: string; status: string; total: number | string; pago: boolean; carro?: { placa: string; modelo: string } | null }
interface ParcelaFicha { id: string; parcela: number; totalParcelas: number; valor: number | string; vencimento: string; status: string }
interface ClienteFicha {
  id: string;
  nome: string;
  tipo: 'PF' | 'PJ';
  cpfCnpj: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  endereco: string | null;
  observacoes: string | null;
  dataCadastro: string;
  carros: CarroFicha[];
  ordens: OSFicha[];
  contasReceber: ParcelaFicha[];
  fiadoEmAberto: number;
}

function FichaCliente({ clienteId, onFechar, onEditar }: { clienteId: string; onFechar: () => void; onEditar: () => void }) {
  const [c, setC] = useState<ClienteFicha | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api<ClienteFicha>(`/clientes/${clienteId}`).then(setC).catch(() => setErro('Não foi possível carregar a ficha'));
  }, [clienteId]);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const emAtraso = (p: ParcelaFicha) => p.status !== 'PAGA' && new Date(p.vencimento) < hoje;

  return (
    <Modal
      title={c ? c.nome : 'Ficha do cliente'}
      size="lg"
      onClose={onFechar}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Fechar</BtnGhost>
          <BtnPrimary onClick={onEditar}>
            <span className="inline-flex items-center gap-1.5">
              <Pencil size={16} /> Editar cadastro
            </span>
          </BtnPrimary>
        </>
      }
    >
      {!c ? (
        <div className="text-center text-grafite/40 py-8 text-sm">{erro || 'Carregando...'}</div>
      ) : (
        <>
          {/* Cabeçalho */}
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-full bg-petroleo text-white grid place-items-center font-bold">{iniciais(c.nome)}</span>
            <div>
              <Badge>{c.tipo === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}</Badge>
              <div className="text-xs text-grafite/50 mt-1">Cliente desde {dataBR(c.dataCadastro)}</div>
            </div>
          </div>

          {/* Contato */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 bg-fundo rounded-xl p-3 text-sm">
            <InfoLinha rotulo="Telefone" valor={c.telefone} />
            <InfoLinha rotulo="WhatsApp" valor={c.whatsapp} />
            <InfoLinha rotulo="E-mail" valor={c.email} />
            <InfoLinha rotulo="CPF / CNPJ" valor={c.cpfCnpj} />
            <div className="col-span-2"><InfoLinha rotulo="Endereço" valor={c.endereco} /></div>
          </div>

          {/* Fiado em aberto */}
          {c.fiadoEmAberto > 0 && (
            <div className={`rounded-xl p-3 flex items-center gap-3 ${c.contasReceber.some(emAtraso) ? 'bg-vermelho-bg' : 'bg-amarelo-bg'}`}>
              {c.contasReceber.some(emAtraso) ? <AlertTriangle size={26} className="text-vermelho shrink-0" /> : <Receipt size={26} className="text-amarelo shrink-0" />}
              <div className="flex-1">
                <div className="text-xs font-semibold text-grafite/60">Fiado em aberto</div>
                <div className="text-xl font-extrabold text-petroleo">{brl(c.fiadoEmAberto)}</div>
              </div>
              <div className="text-right text-xs text-grafite/60">
                {c.contasReceber.length} parcela(s)
                {c.contasReceber.some(emAtraso) && <div className="text-vermelho font-bold">há parcela vencida</div>}
              </div>
            </div>
          )}

          {/* Veículos */}
          <Secao titulo={`Veículos (${c.carros.length})`}>
            {c.carros.length === 0 ? (
              <Vazio texto="Nenhum veículo cadastrado" />
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {c.carros.map((v) => (
                  <div key={v.id} className="border border-linha rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs bg-grafite text-white px-1.5 py-0.5 rounded">{v.placa}</span>
                      <span className="font-bold text-sm">{v.marca} {v.modelo}</span>
                    </div>
                    <div className="text-xs text-grafite/50 mt-0.5">
                      {v.ano ?? '—'}{v.kmAtual != null ? ` · ${v.kmAtual.toLocaleString('pt-BR')} km` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Secao>

          {/* Parcelas em aberto */}
          {c.contasReceber.length > 0 && (
            <Secao titulo="Parcelas em aberto">
              <div className="border border-linha rounded-lg divide-y divide-linha">
                {c.contasReceber.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="text-grafite/60">Parcela {p.parcela}/{p.totalParcelas}</span>
                    <span className={`text-xs ${emAtraso(p) ? 'text-vermelho font-bold' : 'text-grafite/50'}`}>vence {dataBR(p.vencimento)}</span>
                    {emAtraso(p) && <Badge cor="bg-vermelho-bg text-vermelho">em atraso</Badge>}
                    <span className="ml-auto font-bold tabular-nums">{brl(p.valor)}</span>
                  </div>
                ))}
              </div>
            </Secao>
          )}

          {/* Histórico de OS */}
          <Secao titulo={`Últimas ordens de serviço (${c.ordens.length})`}>
            {c.ordens.length === 0 ? (
              <Vazio texto="Nenhuma OS ainda" />
            ) : (
              <div className="border border-linha rounded-lg divide-y divide-linha">
                {c.ordens.map((o) => (
                  <div key={o.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="font-mono font-bold text-grafite/50">#{o.numero}</span>
                    <span className="text-grafite/60 whitespace-nowrap">{dataBR(o.dataAbertura)}</span>
                    <span className="truncate">{o.carro?.modelo ?? '—'}</span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${CORES_STATUS_OS[o.status] ?? 'bg-linha'}`}>{LABEL_STATUS_OS[o.status] ?? o.status}</span>
                    <span className="ml-auto font-bold tabular-nums">{brl(o.total)}</span>
                    {o.pago && <span title="Pago" className="text-verde"><CheckCircle2 size={15} /></span>}
                  </div>
                ))}
              </div>
            )}
          </Secao>

          {c.observacoes && (
            <div className="text-sm text-grafite/60 bg-amarelo-bg/40 rounded-lg p-3 flex gap-2">
              <StickyNote size={16} className="shrink-0 mt-0.5 text-amarelo" />
              <span>{c.observacoes}</span>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function InfoLinha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <div className="text-[11px] font-bold text-grafite/40 uppercase tracking-wide">{rotulo}</div>
      <div className="font-semibold">{valor || '—'}</div>
    </div>
  );
}
function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-bold text-grafite/50 mb-1.5">{titulo}</div>
      {children}
    </div>
  );
}
function Vazio({ texto }: { texto: string }) {
  return <div className="text-sm text-grafite/40 border border-dashed border-linha rounded-lg py-3 text-center">{texto}</div>;
}

function FormCliente({ cliente, onFechar, onSalvo }: { cliente: Cliente | null; onFechar: () => void; onSalvo: () => void }) {
  const editando = !!cliente;
  const [form, setForm] = useState({
    nome: cliente?.nome ?? '',
    tipo: cliente?.tipo ?? 'PF',
    cpfCnpj: cliente?.cpfCnpj ?? '',
    telefone: cliente?.telefone ?? '',
    email: cliente?.email ?? '',
  });
  const [erros, setErros] = useState<Record<string, string[]>>({});
  const [salvando, setSalvando] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function salvar() {
    setSalvando(true);
    setErros({});
    try {
      if (editando) await api(`/clientes/${cliente!.id}`, { method: 'PUT', body: form });
      else await api('/clientes', { method: 'POST', body: form });
      onSalvo();
    } catch (err) {
      if (err instanceof ApiError) setErros(err.erros ?? { nome: [err.message] });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title={editando ? 'Editar cliente' : 'Novo cliente'}
      onClose={onFechar}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Salvar cliente'}
          </BtnPrimary>
        </>
      }
    >
      <Campo label="Nome completo" erro={erros.nome?.[0]}>
        <input value={form.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex: Carlos Andrade" className={inputCls} />
      </Campo>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Tipo">
          <select value={form.tipo} onChange={(e) => set('tipo', e.target.value)} className={inputCls}>
            <option value="PF">Pessoa Física</option>
            <option value="PJ">Pessoa Jurídica</option>
          </select>
        </Campo>
        <Campo label="CPF / CNPJ" erro={erros.cpfCnpj?.[0]}>
          <input value={form.cpfCnpj} onChange={(e) => set('cpfCnpj', e.target.value)} className={inputCls} />
        </Campo>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Telefone" erro={erros.telefone?.[0]}>
          <input value={form.telefone} onChange={(e) => set('telefone', e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="E-mail" erro={erros.email?.[0]}>
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} />
        </Campo>
      </div>
    </Modal>
  );
}
