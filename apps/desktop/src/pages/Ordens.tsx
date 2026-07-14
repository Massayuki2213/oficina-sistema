import { useEffect, useState, type ReactNode } from 'react';
import { Play, Check, Printer, Banknote, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAvisos } from '../lib/avisos';
import { brl, dataBR, LABEL_STATUS_OS, CORES_STATUS_OS } from '../lib/format';
import { PageHeader, SearchBar, BtnPrimary, BtnGhost, Painel, Badge, Modal, Campo, inputCls, thCls, tdCls, VazioOuCarregando } from '../components/ui';
import { DocumentoImpressao, OSDoc } from '../components/Impressao';

interface OSItem {
  id: string;
  numero: number;
  dataAbertura: string;
  status: string;
  total: number;
  pago: boolean;
  formaPagamento: string | null;
  cliente?: { nome: string };
  carro?: { placa: string; modelo: string };
  mecanico?: { nome: string } | null;
}

const STATUS_FILTRO = ['ABERTA', 'EM_EXECUCAO', 'AGUARDANDO_PECA', 'CONCLUIDA', 'ENTREGUE', 'CANCELADA'];

export default function Ordens() {
  const [ordens, setOrdens] = useState<OSItem[]>([]);
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [receber, setReceber] = useState<{ id: string; numero: number; total: number } | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const p = new URLSearchParams();
      if (busca) p.set('busca', busca);
      if (status) p.set('status', status);
      const qs = p.toString();
      setOrdens(await api<OSItem[]>(`/ordens${qs ? `?${qs}` : ''}`));
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    carregar();
  }, [status]);

  return (
    <div>
      <PageHeader title="Ordens de Serviço" subtitle={`${ordens.length} OS`}>
        <SearchBar value={busca} onChange={setBusca} onSubmit={carregar} placeholder="Cliente ou placa..." />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-white border border-linha rounded-xl px-3 py-2.5 text-sm font-semibold text-grafite/70 outline-none focus:border-laranja">
          <option value="">Todos os status</option>
          {STATUS_FILTRO.map((s) => (
            <option key={s} value={s}>{LABEL_STATUS_OS[s]}</option>
          ))}
        </select>
      </PageHeader>

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Nº</th>
              <th className={thCls}>Abertura</th>
              <th className={thCls}>Cliente</th>
              <th className={thCls}>Veículo</th>
              <th className={thCls}>Mecânico</th>
              <th className={`${thCls} text-right`}>Total</th>
              <th className={thCls}>Status</th>
            </tr>
          </thead>
          <tbody>
            <VazioOuCarregando carregando={carregando} vazio={ordens.length === 0} colSpan={7} />
            {ordens.map((o) => (
              <tr key={o.id} onClick={() => setDetalhe(o.id)} className="border-b border-fundo last:border-0 hover:bg-fundo/40 transition cursor-pointer">
                <td className={`${tdCls} font-mono font-bold text-grafite/60`}>#{o.numero}</td>
                <td className={`${tdCls} text-grafite/60 whitespace-nowrap`}>{dataBR(o.dataAbertura)}</td>
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
                <td className={`${tdCls} text-grafite/60`}>{o.mecanico?.nome ?? <span className="text-grafite/30">sem mecânico</span>}</td>
                <td className={`${tdCls} text-right font-extrabold tabular-nums`}>{brl(o.total)}</td>
                <td className={tdCls}>
                  <div className="flex items-center gap-1.5">
                    <Badge cor={CORES_STATUS_OS[o.status]}>{LABEL_STATUS_OS[o.status] ?? o.status}</Badge>
                    {o.pago && <span title="Pago" className="text-verde"><CheckCircle2 size={15} /></span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Painel>

      {detalhe && (
        <DetalheOrdem
          id={detalhe}
          onFechar={() => setDetalhe(null)}
          onMudou={carregar}
          onReceber={(os) => {
            setDetalhe(null);
            setReceber(os);
          }}
        />
      )}
      {receber && (
        <ReceberPagamento
          os={receber}
          onFechar={() => setReceber(null)}
          onRecebido={() => {
            setReceber(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}

// Ações de avanço do fluxo por status atual.
const iniciar = (
  <span className="inline-flex items-center gap-1.5"><Play size={14} /> Iniciar serviço</span>
);
const ACOES: Record<string, { status: string; label: ReactNode }[]> = {
  ABERTA: [{ status: 'EM_EXECUCAO', label: iniciar }],
  AGUARDANDO_PECA: [{ status: 'EM_EXECUCAO', label: iniciar }],
  EM_EXECUCAO: [
    { status: 'AGUARDANDO_PECA', label: 'Aguardar peça' },
    { status: 'CONCLUIDA', label: <span className="inline-flex items-center gap-1.5"><Check size={14} /> Concluir</span> },
  ],
  AGUARDANDO_APROVACAO: [{ status: 'EM_EXECUCAO', label: <span className="inline-flex items-center gap-1.5"><Play size={14} /> Retomar</span> }],
  CONCLUIDA: [{ status: 'ENTREGUE', label: 'Marcar entregue' }],
  ENTREGUE: [],
  CANCELADA: [],
};
const CANCELAVEIS = ['ABERTA', 'AGUARDANDO_PECA', 'EM_EXECUCAO'];

interface OSFull extends OSItem {
  cliente?: { nome: string; telefone?: string | null; cpfCnpj?: string | null };
  carro?: { placa: string; modelo: string; marca?: string; ano?: number | null; kmAtual?: number | null };
  servicos: { id: string; quantidade: number; precoUnit: number; servico?: { nome: string } }[];
  pecas: { id: string; quantidade: number; precoUnit: number; peca?: { nome: string } }[];
  orcamentoId: string | null;
}
interface MecanicoOpt { id: string; nome: string }

function DetalheOrdem({
  id,
  onFechar,
  onMudou,
  onReceber,
}: {
  id: string;
  onFechar: () => void;
  onMudou: () => void;
  onReceber: (os: { id: string; numero: number; total: number }) => void;
}) {
  const { usuario } = useAuth();
  const avisos = useAvisos();
  const podeReceber = usuario?.perfil !== 'MECANICO';
  const [os, setOs] = useState<OSFull | null>(null);
  const [mecanicos, setMecanicos] = useState<MecanicoOpt[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [imprimir, setImprimir] = useState(false);

  async function recarregar() {
    const fresca = await api<OSFull>(`/ordens/${id}`);
    setOs(fresca);
    onMudou();
  }
  useEffect(() => {
    api<OSFull>(`/ordens/${id}`).then(setOs).catch(() => setErro('Não foi possível carregar'));
    api<MecanicoOpt[]>('/auth/usuarios?perfil=MECANICO').then(setMecanicos).catch(() => {});
  }, [id]);

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
  const mudarStatus = (status: string) => acao(() => api(`/ordens/${id}/status`, { method: 'PATCH', body: { status } }).then(recarregar));
  async function cancelarOS() {
    const ok = await avisos.confirmar({
      titulo: 'Cancelar esta OS',
      mensagem: 'A ordem passa para "cancelada". As peças já baixadas não voltam ao estoque automaticamente.',
      botao: 'Cancelar OS',
      perigo: true,
    });
    if (ok) await mudarStatus('CANCELADA');
  }
  const atribuir = (mecanicoId: string) => {
    if (!mecanicoId) return;
    acao(() => api(`/ordens/${id}/mecanico`, { method: 'PATCH', body: { mecanicoId } }).then(recarregar));
  };

  const concluida = os && ['CONCLUIDA', 'ENTREGUE'].includes(os.status);
  const podeCobrar = concluida && !os?.pago && podeReceber;

  return (
    <>
    <Modal
      title={os ? `OS #${os.numero}` : 'Ordem de Serviço'}
      size="lg"
      onClose={onFechar}
      footer={
        <>
          {os && (
            <button onClick={() => setImprimir(true)} className="mr-auto inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border-[1.6px] border-linha font-bold text-petroleo hover:bg-fundo">
              <Printer size={16} /> Imprimir
            </button>
          )}
          {os && CANCELAVEIS.includes(os.status) && <BtnGhost onClick={() => void cancelarOS()}>Cancelar OS</BtnGhost>}
          {os && ACOES[os.status]?.map((a) => (
            <BtnGhost key={a.status} onClick={() => mudarStatus(a.status)}>{a.label}</BtnGhost>
          ))}
          {podeCobrar ? (
            <BtnPrimary onClick={() => onReceber({ id: os!.id, numero: os!.numero, total: os!.total })} disabled={ocupado}>
              <span className="inline-flex items-center gap-1.5"><Banknote size={16} /> Receber pagamento</span>
            </BtnPrimary>
          ) : (
            <BtnPrimary onClick={onFechar} disabled={ocupado}>Fechar</BtnPrimary>
          )}
        </>
      }
    >
      {!os ? (
        <div className="text-center text-grafite/40 py-8 text-sm">{erro || 'Carregando...'}</div>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge cor={CORES_STATUS_OS[os.status]}>{LABEL_STATUS_OS[os.status] ?? os.status}</Badge>
            {os.pago ? (
              <Badge cor="bg-verde-bg text-verde">
                <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} /> Pago{os.formaPagamento ? ` · ${os.formaPagamento}` : ''}</span>
              </Badge>
            ) : concluida ? (
              <Badge cor="bg-amarelo-bg text-amarelo">Aguardando pagamento</Badge>
            ) : null}
            <span className="text-sm text-grafite/50">aberta {dataBR(os.dataAbertura)}</span>
          </div>

          <div className="bg-fundo rounded-xl p-3 text-sm">
            <div className="font-bold text-petroleo">{os.cliente?.nome}</div>
            {os.carro && (
              <div className="text-grafite/60">
                <span className="font-mono text-xs bg-grafite text-white px-1.5 py-0.5 rounded">{os.carro.placa}</span> {os.carro.modelo}
              </div>
            )}
          </div>

          {os.servicos.length > 0 && (
            <div>
              <div className="text-xs font-bold text-grafite/50 mb-1">Serviços</div>
              <ItensLeitura linhas={os.servicos.map((s) => ({ nome: s.servico?.nome ?? '—', q: s.quantidade, preco: s.precoUnit }))} />
            </div>
          )}
          {os.pecas.length > 0 && (
            <div>
              <div className="text-xs font-bold text-grafite/50 mb-1">Peças</div>
              <ItensLeitura linhas={os.pecas.map((p) => ({ nome: p.peca?.nome ?? '—', q: p.quantidade, preco: p.precoUnit }))} />
            </div>
          )}

          <div className="flex justify-end text-sm border-t border-linha pt-3">
            <span className="text-grafite/50">Total <b className="text-petroleo text-base">{brl(os.total)}</b></span>
          </div>

          {os.status !== 'ENTREGUE' && os.status !== 'CANCELADA' && (
            <Campo label="Mecânico responsável">
              <select value="" onChange={(e) => atribuir(e.target.value)} className={inputCls} disabled={ocupado}>
                <option value="">{os.mecanico?.nome ? `Atual: ${os.mecanico.nome} — trocar...` : 'Atribuir mecânico...'}</option>
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
    {imprimir && os && (
      <DocumentoImpressao onFechar={() => setImprimir(false)}>
        <OSDoc os={os} />
      </DocumentoImpressao>
    )}
    </>
  );
}

function ReceberPagamento({
  os,
  onFechar,
  onRecebido,
}: {
  os: { id: string; numero: number; total: number };
  onFechar: () => void;
  onRecebido: () => void;
}) {
  const avisos = useAvisos();
  const [forma, setForma] = useState('A_VISTA');
  const [parcelas, setParcelas] = useState('2');
  const [primeiroVenc, setPrimeiroVenc] = useState('30');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const parcelado = forma === 'PARCELADO' || forma === 'FIADO';

  async function confirmar() {
    setSalvando(true);
    setErro('');
    try {
      const r = await api<{ aVista: boolean; parcelas: number }>(`/ordens/${os.id}/receber`, {
        method: 'POST',
        body: { formaPagamento: forma, parcelas: Number(parcelas) || 1, primeiroVencimentoDias: Number(primeiroVenc) || 30 },
      });
      if (r.aVista) avisos.sucesso(`Recebido! Entrou ${brl(os.total)} no caixa.`);
      else avisos.sucesso(`OS entregue — ${r.parcelas} parcela(s) geradas em Contas a Receber.`);
      onRecebido();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Erro ao receber');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title={`Receber OS #${os.numero}`}
      onClose={onFechar}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary onClick={confirmar} disabled={salvando}>{salvando ? 'Recebendo...' : `Confirmar ${brl(os.total)}`}</BtnPrimary>
        </>
      }
    >
      <div className="bg-verde-bg/50 rounded-xl p-4 text-center">
        <div className="text-xs text-grafite/50 font-semibold">Total da OS</div>
        <div className="text-3xl font-extrabold text-verde">{brl(os.total)}</div>
      </div>
      <Campo label="Forma de pagamento">
        <select value={forma} onChange={(e) => setForma(e.target.value)} className={inputCls}>
          <option value="A_VISTA">À vista (dinheiro)</option>
          <option value="PIX">PIX</option>
          <option value="CARTAO">Cartão</option>
          <option value="PARCELADO">Parcelado</option>
          <option value="FIADO">Fiado</option>
        </select>
      </Campo>
      {parcelado ? (
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Nº de parcelas">
            <input type="number" min={1} max={24} value={parcelas} onChange={(e) => setParcelas(e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="1º vencimento (dias)">
            <input type="number" min={0} value={primeiroVenc} onChange={(e) => setPrimeiroVenc(e.target.value)} className={inputCls} />
          </Campo>
        </div>
      ) : (
        <p className="text-sm text-grafite/50">Entra direto no livro-caixa como entrada de hoje.</p>
      )}
      {parcelado && (
        <p className="text-sm text-grafite/50">
          Gera {parcelas || 1} parcela(s) em <b>Contas a Receber</b>; cada uma entra no caixa quando for recebida.
        </p>
      )}
      {erro && <div className="text-vermelho text-sm font-semibold">{erro}</div>}
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
