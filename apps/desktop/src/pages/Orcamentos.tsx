import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { brl, dataBR, LABEL_STATUS_ORCAMENTO, CORES_STATUS_ORCAMENTO } from '../lib/format';
import { PageHeader, SearchBar, BtnPrimary, BtnGhost, Painel, Badge, Modal, Campo, inputCls, thCls, tdCls, VazioOuCarregando } from '../components/ui';

interface OrcItem {
  id: string;
  numero: number;
  data: string;
  status: string;
  subtotal: number;
  desconto: number;
  total: number;
  cliente?: { nome: string };
  carro?: { placa: string; modelo: string };
}
interface AprovarResp {
  os: { numero: number };
  aguardandoPeca: boolean;
}

const FINALIZADOS = ['APROVADO', 'RECUSADO', 'EXPIRADO'];

export default function Orcamentos() {
  const [orcamentos, setOrcamentos] = useState<OrcItem[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [novo, setNovo] = useState(false);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function carregar(termo = '') {
    setCarregando(true);
    try {
      setOrcamentos(await api<OrcItem[]>(termo ? `/orcamentos?busca=${encodeURIComponent(termo)}` : '/orcamentos'));
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    carregar();
  }, []);

  async function aprovarRapido(o: OrcItem) {
    if (!confirm(`Aprovar o orçamento #${o.numero} e gerar a Ordem de Serviço? Isso baixa o estoque das peças.`)) return;
    setOcupado(o.id);
    try {
      const r = await api<AprovarResp>(`/orcamentos/${o.id}/aprovar`, { method: 'POST', body: {} });
      alert(`✅ OS #${r.os.numero} gerada${r.aguardandoPeca ? ' — nasce aguardando peça (estoque insuficiente)' : ''}!`);
      carregar(busca);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Erro ao aprovar');
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div>
      <PageHeader title="Orçamentos" subtitle={`${orcamentos.length} orçamento(s)`}>
        <SearchBar value={busca} onChange={setBusca} onSubmit={() => carregar(busca)} placeholder="Cliente ou placa..." />
        <BtnPrimary onClick={() => setNovo(true)}>+ Novo orçamento</BtnPrimary>
      </PageHeader>

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Nº</th>
              <th className={thCls}>Data</th>
              <th className={thCls}>Cliente</th>
              <th className={thCls}>Veículo</th>
              <th className={`${thCls} text-right`}>Total</th>
              <th className={thCls}>Status</th>
              <th className={`${thCls} text-right`}>Ação</th>
            </tr>
          </thead>
          <tbody>
            <VazioOuCarregando carregando={carregando} vazio={orcamentos.length === 0} colSpan={7} />
            {orcamentos.map((o) => {
              const aprovavel = !FINALIZADOS.includes(o.status);
              return (
                <tr key={o.id} onClick={() => setDetalhe(o.id)} className="border-b border-fundo last:border-0 hover:bg-fundo/40 transition cursor-pointer">
                  <td className={`${tdCls} font-mono font-bold text-grafite/60`}>#{o.numero}</td>
                  <td className={`${tdCls} text-grafite/60 whitespace-nowrap`}>{dataBR(o.data)}</td>
                  <td className={`${tdCls} font-bold`}>{o.cliente?.nome ?? '—'}</td>
                  <td className={tdCls}>
                    {o.carro ? (
                      <span>
                        <span className="font-mono text-xs bg-grafite text-white px-1.5 py-0.5 rounded">{o.carro.placa}</span>{' '}
                        <span className="text-grafite/60">{o.carro.modelo}</span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={`${tdCls} text-right font-extrabold tabular-nums`}>{brl(o.total)}</td>
                  <td className={tdCls}>
                    <Badge cor={CORES_STATUS_ORCAMENTO[o.status]}>{LABEL_STATUS_ORCAMENTO[o.status] ?? o.status}</Badge>
                  </td>
                  <td className={`${tdCls} text-right`} onClick={(e) => e.stopPropagation()}>
                    {aprovavel && (
                      <button
                        onClick={() => aprovarRapido(o)}
                        disabled={ocupado === o.id}
                        className="bg-verde/10 text-verde font-bold px-3 py-1.5 rounded-lg hover:bg-verde/20 disabled:opacity-50 transition whitespace-nowrap"
                      >
                        {ocupado === o.id ? '...' : '⚡ Aprovar → OS'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Painel>

      {novo && <NovoOrcamento onFechar={() => setNovo(false)} onSalvo={() => { setNovo(false); carregar(); }} />}
      {detalhe && (
        <DetalheOrcamento
          id={detalhe}
          onFechar={() => setDetalhe(null)}
          onMudou={() => carregar(busca)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Montador de orçamento (cliente + veículo + serviços + peças).
// ------------------------------------------------------------------
interface ClienteOpt { id: string; nome: string }
interface CarroOpt { id: string; placa: string; modelo: string; marca: string; clienteId: string }
interface ServicoOpt { id: string; nome: string; precoMaoDeObra: number }
interface PecaOpt { id: string; nome: string; precoVenda: number; estoqueAtual: number; unidade: string }
type LinhaServ = { id: string; nome: string; preco: number; quantidade: number };
type LinhaPec = { id: string; nome: string; preco: number; quantidade: number; estoque: number; unidade: string };

function NovoOrcamento({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const { usuario } = useAuth();
  const podeDesconto = usuario?.perfil !== 'MECANICO';

  const [clientes, setClientes] = useState<ClienteOpt[]>([]);
  const [carros, setCarros] = useState<CarroOpt[]>([]);
  const [catServ, setCatServ] = useState<ServicoOpt[]>([]);
  const [catPec, setCatPec] = useState<PecaOpt[]>([]);

  const [clienteId, setClienteId] = useState('');
  const [carroId, setCarroId] = useState('');
  const [servs, setServs] = useState<LinhaServ[]>([]);
  const [pecs, setPecs] = useState<LinhaPec[]>([]);
  const [desconto, setDesconto] = useState('');
  const [validadeDias, setValidadeDias] = useState('15');
  const [observacoes, setObservacoes] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api<ClienteOpt[]>('/clientes').then(setClientes).catch(() => {});
    api<CarroOpt[]>('/carros').then(setCarros).catch(() => {});
    api<ServicoOpt[]>('/servicos').then(setCatServ).catch(() => {});
    api<PecaOpt[]>('/pecas').then(setCatPec).catch(() => {});
  }, []);

  const carrosDoCliente = useMemo(() => carros.filter((c) => c.clienteId === clienteId), [carros, clienteId]);

  function addServico(id: string) {
    const s = catServ.find((x) => x.id === id);
    if (!s || servs.some((x) => x.id === id)) return;
    setServs((l) => [...l, { id: s.id, nome: s.nome, preco: s.precoMaoDeObra, quantidade: 1 }]);
  }
  function addPeca(id: string) {
    const p = catPec.find((x) => x.id === id);
    if (!p || pecs.some((x) => x.id === id)) return;
    setPecs((l) => [...l, { id: p.id, nome: p.nome, preco: p.precoVenda, quantidade: 1, estoque: p.estoqueAtual, unidade: p.unidade }]);
  }
  const setQtdServ = (id: string, q: number) => setServs((l) => l.map((x) => (x.id === id ? { ...x, quantidade: Math.max(1, q) } : x)));
  const setQtdPec = (id: string, q: number) => setPecs((l) => l.map((x) => (x.id === id ? { ...x, quantidade: Math.max(1, q) } : x)));

  const subtotal = servs.reduce((s, x) => s + x.preco * x.quantidade, 0) + pecs.reduce((s, x) => s + x.preco * x.quantidade, 0);
  const descNum = Math.min(podeDesconto ? parseFloat(desconto) || 0 : 0, subtotal);
  const total = subtotal - descNum;
  const semItens = servs.length + pecs.length === 0;

  async function salvar() {
    setErro('');
    if (!clienteId) return setErro('Selecione o cliente.');
    if (!carroId) return setErro('Selecione o veículo.');
    if (semItens) return setErro('Adicione ao menos 1 serviço ou peça.');
    setSalvando(true);
    try {
      await api('/orcamentos', {
        method: 'POST',
        body: {
          clienteId,
          carroId,
          validadeDias: Number(validadeDias) || 15,
          desconto: descNum,
          observacoes,
          servicos: servs.map((s) => ({ servicoId: s.id, quantidade: s.quantidade })),
          pecas: pecs.map((p) => ({ pecaId: p.id, quantidade: p.quantidade })),
        },
      });
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title="Novo orçamento"
      size="lg"
      onClose={onFechar}
      footer={
        <>
          <div className="mr-auto text-sm text-grafite/60 self-center">
            Subtotal <b className="text-grafite">{brl(subtotal)}</b>
            {descNum > 0 && <span className="text-vermelho"> − {brl(descNum)}</span>}
            <span className="mx-1">=</span>
            <b className="text-petroleo text-base">{brl(total)}</b>
          </div>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar orçamento'}
          </BtnPrimary>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Cliente">
          <select
            value={clienteId}
            onChange={(e) => {
              setClienteId(e.target.value);
              setCarroId('');
            }}
            className={inputCls}
          >
            <option value="">Selecione...</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </Campo>
        <Campo label="Veículo">
          <select value={carroId} onChange={(e) => setCarroId(e.target.value)} disabled={!clienteId} className={inputCls}>
            <option value="">{clienteId ? (carrosDoCliente.length ? 'Selecione...' : 'Cliente sem veículo') : 'Escolha o cliente'}</option>
            {carrosDoCliente.map((c) => (
              <option key={c.id} value={c.id}>{c.placa} — {c.marca} {c.modelo}</option>
            ))}
          </select>
        </Campo>
      </div>

      {/* Serviços */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <label className="text-xs font-bold text-grafite/50">Serviços (mão de obra)</label>
          <select value="" onChange={(e) => addServico(e.target.value)} className="ml-auto text-sm border border-linha rounded-lg px-2 py-1 outline-none focus:border-laranja">
            <option value="">+ adicionar serviço</option>
            {catServ.filter((s) => !servs.some((x) => x.id === s.id)).map((s) => (
              <option key={s.id} value={s.id}>{s.nome} — {brl(s.precoMaoDeObra)}</option>
            ))}
          </select>
        </div>
        <ListaItens
          vazio={servs.length === 0}
          textoVazio="Nenhum serviço"
          linhas={servs.map((s) => ({
            id: s.id,
            nome: s.nome,
            preco: s.preco,
            quantidade: s.quantidade,
            subtotal: s.preco * s.quantidade,
            onQtd: (q) => setQtdServ(s.id, q),
            onRemover: () => setServs((l) => l.filter((x) => x.id !== s.id)),
          }))}
        />
      </div>

      {/* Peças */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <label className="text-xs font-bold text-grafite/50">Peças</label>
          <select value="" onChange={(e) => addPeca(e.target.value)} className="ml-auto text-sm border border-linha rounded-lg px-2 py-1 outline-none focus:border-laranja">
            <option value="">+ adicionar peça</option>
            {catPec.filter((p) => !pecs.some((x) => x.id === p.id)).map((p) => (
              <option key={p.id} value={p.id}>{p.nome} — {brl(p.precoVenda)} ({p.estoqueAtual} {p.unidade})</option>
            ))}
          </select>
        </div>
        <ListaItens
          vazio={pecs.length === 0}
          textoVazio="Nenhuma peça"
          linhas={pecs.map((p) => ({
            id: p.id,
            nome: p.nome,
            preco: p.preco,
            quantidade: p.quantidade,
            subtotal: p.preco * p.quantidade,
            aviso: p.quantidade > p.estoque ? `só ${p.estoque} em estoque` : undefined,
            onQtd: (q) => setQtdPec(p.id, q),
            onRemover: () => setPecs((l) => l.filter((x) => x.id !== p.id)),
          }))}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {podeDesconto && (
          <Campo label="Desconto (R$)">
            <input type="number" step="0.01" value={desconto} onChange={(e) => setDesconto(e.target.value)} className={inputCls} />
          </Campo>
        )}
        <Campo label="Validade (dias)">
          <input type="number" value={validadeDias} onChange={(e) => setValidadeDias(e.target.value)} className={inputCls} />
        </Campo>
      </div>
      <Campo label="Observações">
        <input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Opcional" className={inputCls} />
      </Campo>
      {erro && <div className="text-vermelho text-sm font-semibold">{erro}</div>}
    </Modal>
  );
}

type LinhaUI = {
  id: string;
  nome: string;
  preco: number;
  quantidade: number;
  subtotal: number;
  aviso?: string;
  onQtd: (q: number) => void;
  onRemover: () => void;
};
function ListaItens({ linhas, vazio, textoVazio }: { linhas: LinhaUI[]; vazio: boolean; textoVazio: string }) {
  if (vazio) return <div className="text-sm text-grafite/40 border border-dashed border-linha rounded-lg py-3 text-center">{textoVazio}</div>;
  return (
    <div className="border border-linha rounded-lg divide-y divide-linha">
      {linhas.map((l) => (
        <div key={l.id} className="flex items-center gap-3 px-3 py-2">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm truncate">{l.nome}</div>
            <div className="text-xs text-grafite/50">
              {brl(l.preco)} cada{l.aviso && <span className="text-amarelo font-bold"> · {l.aviso}</span>}
            </div>
          </div>
          <input
            type="number"
            min={1}
            value={l.quantidade}
            onChange={(e) => l.onQtd(parseInt(e.target.value) || 1)}
            className="w-16 px-2 py-1.5 border border-linha rounded-lg text-center outline-none focus:border-laranja"
          />
          <div className="w-24 text-right font-bold tabular-nums text-sm">{brl(l.subtotal)}</div>
          <button onClick={l.onRemover} className="text-grafite/30 hover:text-vermelho text-lg" title="Remover">×</button>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------
// Detalhe do orçamento + ações (aprovar / enviar / recusar).
// ------------------------------------------------------------------
interface OrcFull extends OrcItem {
  observacoes: string | null;
  validade: string;
  cliente?: { nome: string; telefone?: string | null };
  carro?: { placa: string; modelo: string; marca?: string };
  servicos: { id: string; quantidade: number; precoUnit: number; servico?: { nome: string } }[];
  pecas: { id: string; quantidade: number; precoUnit: number; peca?: { nome: string } }[];
}
interface MecanicoOpt { id: string; nome: string }

function DetalheOrcamento({ id, onFechar, onMudou }: { id: string; onFechar: () => void; onMudou: () => void }) {
  const [orc, setOrc] = useState<OrcFull | null>(null);
  const [mecanicos, setMecanicos] = useState<MecanicoOpt[]>([]);
  const [mecanicoId, setMecanicoId] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api<OrcFull>(`/orcamentos/${id}`).then(setOrc).catch(() => setErro('Não foi possível carregar'));
    api<MecanicoOpt[]>('/auth/usuarios?perfil=MECANICO').then(setMecanicos).catch(() => {});
  }, [id]);

  const aprovavel = orc && !FINALIZADOS.includes(orc.status);

  async function acao(fn: () => Promise<void>) {
    setOcupado(true);
    setErro('');
    try {
      await fn();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Erro');
    } finally {
      setOcupado(false);
    }
  }

  const aprovar = () =>
    acao(async () => {
      const r = await api<AprovarResp>(`/orcamentos/${id}/aprovar`, { method: 'POST', body: { mecanicoId } });
      alert(`✅ OS #${r.os.numero} gerada${r.aguardandoPeca ? ' — aguardando peça (estoque insuficiente)' : ''}!`);
      onMudou();
      onFechar();
    });
  const mudarStatus = (status: string) =>
    acao(async () => {
      await api(`/orcamentos/${id}/status`, { method: 'PATCH', body: { status } });
      onMudou();
      onFechar();
    });

  return (
    <Modal
      title={orc ? `Orçamento #${orc.numero}` : 'Orçamento'}
      size="lg"
      onClose={onFechar}
      footer={
        <>
          {aprovavel && orc?.status === 'RASCUNHO' && <BtnGhost onClick={() => mudarStatus('ENVIADO')}>Marcar como enviado</BtnGhost>}
          {aprovavel && <BtnGhost onClick={() => mudarStatus('RECUSADO')}>Recusar</BtnGhost>}
          {aprovavel ? (
            <BtnPrimary onClick={aprovar} disabled={ocupado}>{ocupado ? '...' : '⚡ Aprovar → gerar OS'}</BtnPrimary>
          ) : (
            <BtnGhost onClick={onFechar}>Fechar</BtnGhost>
          )}
        </>
      }
    >
      {!orc ? (
        <div className="text-center text-grafite/40 py-8 text-sm">{erro || 'Carregando...'}</div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Badge cor={CORES_STATUS_ORCAMENTO[orc.status]}>{LABEL_STATUS_ORCAMENTO[orc.status] ?? orc.status}</Badge>
            <span className="text-sm text-grafite/60">{dataBR(orc.data)} · vale até {dataBR(orc.validade)}</span>
          </div>
          <div className="bg-fundo rounded-xl p-3 text-sm">
            <div className="font-bold text-petroleo">{orc.cliente?.nome}</div>
            {orc.carro && (
              <div className="text-grafite/60">
                <span className="font-mono text-xs bg-grafite text-white px-1.5 py-0.5 rounded">{orc.carro.placa}</span> {orc.carro.marca} {orc.carro.modelo}
              </div>
            )}
          </div>

          {orc.servicos.length > 0 && (
            <div>
              <div className="text-xs font-bold text-grafite/50 mb-1">Serviços</div>
              <ItensLeitura linhas={orc.servicos.map((s) => ({ nome: s.servico?.nome ?? '—', q: s.quantidade, preco: s.precoUnit }))} />
            </div>
          )}
          {orc.pecas.length > 0 && (
            <div>
              <div className="text-xs font-bold text-grafite/50 mb-1">Peças</div>
              <ItensLeitura linhas={orc.pecas.map((p) => ({ nome: p.peca?.nome ?? '—', q: p.quantidade, preco: p.precoUnit }))} />
            </div>
          )}

          <div className="flex justify-end gap-6 text-sm border-t border-linha pt-3">
            <span className="text-grafite/50">Subtotal <b className="text-grafite">{brl(orc.subtotal)}</b></span>
            {orc.desconto > 0 && <span className="text-vermelho">Desconto {brl(orc.desconto)}</span>}
            <span className="text-grafite/50">Total <b className="text-petroleo text-base">{brl(orc.total)}</b></span>
          </div>

          {orc.observacoes && <div className="text-sm text-grafite/60 bg-amarelo-bg/40 rounded-lg p-3">📝 {orc.observacoes}</div>}

          {aprovavel && (
            <Campo label="Atribuir mecânico (opcional)">
              <select value={mecanicoId} onChange={(e) => setMecanicoId(e.target.value)} className={inputCls}>
                <option value="">Definir depois</option>
                {mecanicos.map((m) => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
                ))}
              </select>
            </Campo>
          )}
          {erro && <div className="text-vermelho text-sm font-semibold">{erro}</div>}
        </>
      )}
    </Modal>
  );
}

function ItensLeitura({ linhas }: { linhas: { nome: string; q: number; preco: number }[] }) {
  return (
    <div className="border border-linha rounded-lg divide-y divide-linha">
      {linhas.map((l, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
          <span className="flex-1 font-semibold truncate">{l.nome}</span>
          <span className="text-grafite/50 tabular-nums">{l.q} × {brl(l.preco)}</span>
          <span className="w-24 text-right font-bold tabular-nums">{brl(l.q * l.preco)}</span>
        </div>
      ))}
    </div>
  );
}
