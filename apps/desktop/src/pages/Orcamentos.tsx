import { useEffect, useMemo, useState } from 'react';
import { Zap, Printer, StickyNote } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { buscarLista } from '../lib/carregar';
import { useAuth } from '../lib/auth';
import { useAvisos } from '../lib/avisos';
import { brl, dataBR, LABEL_STATUS_ORCAMENTO, CORES_STATUS_ORCAMENTO } from '../lib/format';
import { mascaraTelefone } from '../lib/mascaras';
import { PageHeader, SearchBar, BtnPrimary, BtnGhost, Painel, Badge, Modal, Campo, AcaoEditar, AcaoExcluir, InputDinheiro, inputCls, thCls, tdCls, VazioOuCarregando, PedirSenhaDono } from '../components/ui';
import { DocumentoImpressao, OrcamentoDoc } from '../components/Impressao';

interface OrcItem {
  id: string;
  numero: number;
  data: string;
  status: string;
  subtotal: number;
  desconto: number;
  total: number;
  // Ausentes no orçamento RÁPIDO — nele valem os campos de contato livre.
  cliente?: { nome: string } | null;
  carro?: { placa: string; modelo: string } | null;
  contatoNome?: string | null;
  contatoTelefone?: string | null;
  veiculoDescricao?: string | null;
}
interface AprovarResp {
  os: { numero: number };
  aguardandoPeca: boolean;
}

const FINALIZADOS = ['APROVADO', 'RECUSADO', 'EXPIRADO'];

export default function Orcamentos() {
  const { usuario } = useAuth();
  const avisos = useAvisos();
  const ehDono = usuario?.perfil === 'DONO';
  const [orcamentos, setOrcamentos] = useState<OrcItem[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [identificar, setIdentificar] = useState<OrcItem | null>(null);

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
    // Orçamento rápido não tem dono nem veículo: a OS precisa saber em qual
    // carro se mexeu, então o cadastro é pedido aqui, e não antes do preço.
    if (!o.cliente) return setIdentificar(o);

    const ok = await avisos.confirmar({
      titulo: `Aprovar orçamento #${o.numero}`,
      mensagem: 'A Ordem de Serviço é gerada na hora e o estoque das peças é baixado.',
      botao: 'Aprovar e gerar OS',
    });
    if (!ok) return;

    setOcupado(o.id);
    try {
      const r = await api<AprovarResp>(`/orcamentos/${o.id}/aprovar`, { method: 'POST', body: {} });
      if (r.aguardandoPeca) avisos.info(`OS #${r.os.numero} gerada — nasce aguardando peça (estoque insuficiente).`);
      else avisos.sucesso(`OS #${r.os.numero} gerada!`);
      carregar(busca);
    } catch (err) {
      avisos.erro(err instanceof ApiError ? err.message : 'Erro ao aprovar');
    } finally {
      setOcupado(null);
    }
  }

  async function excluir(o: OrcItem) {
    const ok = await avisos.confirmar({
      titulo: `Excluir orçamento #${o.numero}`,
      mensagem: `O orçamento de ${o.cliente?.nome ?? o.contatoNome ?? 'contato não identificado'} (${brl(o.total)}) será apagado.`,
      botao: 'Excluir',
      perigo: true,
    });
    if (!ok) return;

    setOcupado(o.id);
    try {
      await api(`/orcamentos/${o.id}`, { method: 'DELETE' });
      avisos.sucesso(`Orçamento #${o.numero} excluído.`);
      await carregar(busca);
    } catch (err) {
      avisos.erro(err instanceof ApiError ? err.message : 'Erro ao excluir');
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
                  <td className={tdCls}>
                    {o.cliente ? (
                      <span className="font-bold">{o.cliente.nome}</span>
                    ) : (
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold">{o.contatoNome || 'Sem identificação'}</span>
                        <Badge cor="bg-azul-bg text-azul">Rápido</Badge>
                        {o.contatoTelefone && <span className="text-xs text-grafite/50 w-full">{o.contatoTelefone}</span>}
                      </span>
                    )}
                  </td>
                  <td className={tdCls}>
                    {o.carro ? (
                      <span>
                        <span className="font-mono text-xs bg-grafite text-white px-1.5 py-0.5 rounded">{o.carro.placa}</span>{' '}
                        <span className="text-grafite/60">{o.carro.modelo}</span>
                      </span>
                    ) : o.veiculoDescricao ? (
                      <span className="text-grafite/60">{o.veiculoDescricao}</span>
                    ) : (
                      <span className="text-grafite/30">sem cadastro</span>
                    )}
                  </td>
                  <td className={`${tdCls} text-right font-extrabold tabular-nums`}>{brl(o.total)}</td>
                  <td className={tdCls}>
                    <Badge cor={CORES_STATUS_ORCAMENTO[o.status]}>{LABEL_STATUS_ORCAMENTO[o.status] ?? o.status}</Badge>
                  </td>
                  <td className={`${tdCls} text-right whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
                    {aprovavel && (
                      <button
                        onClick={() => aprovarRapido(o)}
                        disabled={ocupado === o.id}
                        className="bg-verde/10 text-verde font-bold px-3 py-1.5 rounded-lg hover:bg-verde/20 disabled:opacity-50 transition whitespace-nowrap"
                      >
                        {ocupado === o.id ? '...' : <span className="inline-flex items-center gap-1"><Zap size={14} /> Aprovar → OS</span>}
                      </button>
                    )}
                    {/* Aprovado já virou OS e baixou estoque: não se mexe mais. */}
                    {o.status !== 'APROVADO' && (
                      <>
                        <AcaoEditar onClick={() => setEditar(o.id)} />
                        {ehDono && <AcaoExcluir onClick={() => excluir(o)} disabled={ocupado === o.id} />}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Painel>

      {(novo || editar) && (
        <FormOrcamento
          orcamentoId={editar ?? undefined}
          onFechar={() => { setNovo(false); setEditar(null); }}
          onSalvo={(editou) => {
            setNovo(false);
            setEditar(null);
            avisos.sucesso(editou ? 'Orçamento atualizado.' : 'Orçamento criado.');
            carregar(busca);
          }}
        />
      )}
      {detalhe && (
        <DetalheOrcamento
          id={detalhe}
          onFechar={() => setDetalhe(null)}
          onMudou={() => carregar(busca)}
        />
      )}
      {identificar && (
        <IdentificarOrcamento
          orc={identificar}
          onFechar={() => setIdentificar(null)}
          onPronto={(msg) => {
            setIdentificar(null);
            avisos.sucesso(msg);
            carregar(busca);
          }}
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

function FormOrcamento({ orcamentoId, onFechar, onSalvo }: { orcamentoId?: string; onFechar: () => void; onSalvo: (editou: boolean) => void }) {
  const { usuario } = useAuth();
  const podeDesconto = usuario?.perfil !== 'MECANICO';
  const editando = !!orcamentoId;

  const [clientes, setClientes] = useState<ClienteOpt[]>([]);
  const [carros, setCarros] = useState<CarroOpt[]>([]);
  const [catServ, setCatServ] = useState<ServicoOpt[]>([]);
  const [catPec, setCatPec] = useState<PecaOpt[]>([]);

  // Rápido é o padrão ao criar: quem só quer um preço não deve topar com dois
  // cadastros antes de ouvir o valor. Editar abre no modo que o orçamento já é.
  const [modo, setModo] = useState<'RAPIDO' | 'COMPLETO'>('RAPIDO');
  const [clienteId, setClienteId] = useState('');
  const [carroId, setCarroId] = useState('');
  const [contatoNome, setContatoNome] = useState('');
  const [contatoTelefone, setContatoTelefone] = useState('');
  const [veiculoDescricao, setVeiculoDescricao] = useState('');
  const [servs, setServs] = useState<LinhaServ[]>([]);
  const [pecs, setPecs] = useState<LinhaPec[]>([]);
  const [desconto, setDesconto] = useState('');
  const [pedindoSenha, setPedindoSenha] = useState(false);
  const [erroSenha, setErroSenha] = useState('');
  const [validadeDias, setValidadeDias] = useState('15');
  const [observacoes, setObservacoes] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  // Catálogos primeiro; se for edição, o orçamento vem depois deles — as linhas
  // de peça precisam do catálogo para saber estoque e unidade.
  useEffect(() => {
    (async () => {
      const [cli, car, serv, pec] = await Promise.all([
        api<ClienteOpt[]>('/clientes'),
        api<CarroOpt[]>('/carros'),
        api<ServicoOpt[]>('/servicos'),
        api<PecaOpt[]>('/pecas'),
      ]);
      setClientes(cli);
      setCarros(car);
      setCatServ(serv);
      setCatPec(pec);

      if (!orcamentoId) return;
      const o = await api<OrcFull>(`/orcamentos/${orcamentoId}`);
      setModo(o.clienteId ? 'COMPLETO' : 'RAPIDO');
      setClienteId(o.clienteId ?? '');
      setCarroId(o.carroId ?? '');
      setContatoNome(o.contatoNome ?? '');
      setContatoTelefone(o.contatoTelefone ?? '');
      setVeiculoDescricao(o.veiculoDescricao ?? '');
      setServs(o.servicos.map((s) => ({ id: s.servicoId, nome: s.servico?.nome ?? '—', preco: s.precoUnit, quantidade: s.quantidade })));
      setPecs(
        o.pecas.map((p) => {
          const cat = pec.find((x) => x.id === p.pecaId);
          return {
            id: p.pecaId,
            nome: p.peca?.nome ?? '—',
            preco: p.precoUnit,
            quantidade: p.quantidade,
            estoque: cat?.estoqueAtual ?? 0,
            unidade: cat?.unidade ?? 'un',
          };
        }),
      );
      setDesconto(o.desconto ? String(o.desconto) : '');
      setObservacoes(o.observacoes ?? '');
      // A validade é uma data; o formulário trabalha em dias. Mantém o que falta.
      const diasRestantes = Math.ceil((new Date(o.validade).getTime() - Date.now()) / 86_400_000);
      setValidadeDias(String(Math.max(1, diasRestantes)));
    })().catch(() => setErro('Não foi possível carregar o orçamento'));
  }, [orcamentoId]);

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

  async function salvar(senhaDono?: string) {
    setErro('');
    if (modo === 'COMPLETO') {
      if (!clienteId) return setErro('Selecione o cliente.');
      if (!carroId) return setErro('Selecione o veículo.');
    }
    if (semItens) return setErro('Adicione ao menos 1 serviço ou peça.');
    setSalvando(true);
    try {
      const completo = modo === 'COMPLETO';
      const corpo = {
        // Um modo ou outro — mandar os dois deixaria o orçamento em cima do muro.
        clienteId: completo ? clienteId : undefined,
        carroId: completo ? carroId : undefined,
        contatoNome: completo ? undefined : contatoNome,
        contatoTelefone: completo ? undefined : contatoTelefone,
        veiculoDescricao: completo ? undefined : veiculoDescricao,
        validadeDias: Number(validadeDias) || 15,
        desconto: descNum,
        observacoes,
        senhaDono,
        servicos: servs.map((s) => ({ servicoId: s.id, quantidade: s.quantidade })),
        pecas: pecs.map((p) => ({ pecaId: p.id, quantidade: p.quantidade })),
      };
      if (editando) await api(`/orcamentos/${orcamentoId}`, { method: 'PUT', body: corpo });
      else await api('/orcamentos', { method: 'POST', body: corpo });
      setPedindoSenha(false);
      onSalvo(editando);
    } catch (err) {
      // RN-08: desconto acima do teto — pede a senha do Dono e repete o envio.
      if (err instanceof ApiError && err.codigo === 'SENHA_DONO_NECESSARIA') {
        setPedindoSenha(true);
        setErroSenha('');
        return setErro('');
      }
      if (err instanceof ApiError && err.codigo === 'SENHA_DONO_INCORRETA') {
        return setErroSenha(err.message);
      }
      setErro(err instanceof ApiError ? err.message : 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title={editando ? 'Editar orçamento' : 'Novo orçamento'}
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
          <BtnPrimary onClick={() => salvar()} disabled={salvando}>
            {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Salvar orçamento'}
          </BtnPrimary>
        </>
      }
    >
      {/* As duas formas de orçar. Trocar de aba não perde os itens já montados. */}
      <div className="flex items-center gap-1 bg-fundo rounded-xl p-1">
        {(
          [
            { key: 'RAPIDO', titulo: 'Rápido', ajuda: 'Só o preço, sem cadastro' },
            { key: 'COMPLETO', titulo: 'Completo', ajuda: 'Cliente e veículo cadastrados' },
          ] as const
        ).map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setModo(m.key)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition ${
              modo === m.key ? 'bg-white text-petroleo shadow-sm' : 'text-grafite/50 hover:text-grafite'
            }`}
          >
            {m.titulo}
            <span className="block text-[10px] font-semibold opacity-60">{m.ajuda}</span>
          </button>
        ))}
      </div>

      {modo === 'COMPLETO' ? (
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
      ) : (
        <div>
          <div className="grid grid-cols-3 gap-3">
            <Campo label="Nome (opcional)">
              <input value={contatoNome} onChange={(e) => setContatoNome(e.target.value)} placeholder="Quem perguntou" className={inputCls} />
            </Campo>
            <Campo label="Telefone (opcional)">
              <input
                value={contatoTelefone}
                onChange={(e) => setContatoTelefone(mascaraTelefone(e.target.value))}
                placeholder="Para retornar"
                className={inputCls}
              />
            </Campo>
            <Campo label="Veículo (opcional)">
              <input value={veiculoDescricao} onChange={(e) => setVeiculoDescricao(e.target.value)} placeholder="Ex: Gol 2015" className={inputCls} />
            </Campo>
          </div>
          <p className="text-xs text-grafite/50 mt-1.5">
            Nada aqui é obrigatório — serve só para você saber de quem era se o cliente voltar.
            Vira orçamento completo, ou Ordem de Serviço, quando o carro chegar.
          </p>
        </div>
      )}

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
          <Campo label="Desconto">
            <InputDinheiro value={desconto} onChange={setDesconto} />
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

      {pedindoSenha && (
        <PedirSenhaDono
          titulo="Desconto acima do limite"
          mensagem={`O desconto de ${brl(descNum)} passa do que o seu perfil libera sozinho. Peça ao Dono para digitar a senha e autorizar.`}
          erro={erroSenha}
          ocupado={salvando}
          onConfirmar={(senha) => void salvar(senha)}
          onCancelar={() => {
            setPedindoSenha(false);
            setErroSenha('');
          }}
        />
      )}
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
  clienteId: string | null;
  carroId: string | null;
  cliente?: { nome: string; telefone?: string | null; cpfCnpj?: string | null } | null;
  carro?: { placa: string; modelo: string; marca?: string; ano?: number | null; kmAtual?: number | null } | null;
  servicos: { id: string; servicoId: string; quantidade: number; precoUnit: number; servico?: { nome: string } }[];
  pecas: { id: string; pecaId: string; quantidade: number; precoUnit: number; peca?: { nome: string } }[];
}
interface MecanicoOpt { id: string; nome: string }

function DetalheOrcamento({ id, onFechar, onMudou }: { id: string; onFechar: () => void; onMudou: () => void }) {
  const avisos = useAvisos();
  const [orc, setOrc] = useState<OrcFull | null>(null);
  const [mecanicos, setMecanicos] = useState<MecanicoOpt[]>([]);
  const [mecanicoId, setMecanicoId] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [imprimir, setImprimir] = useState(false);

  useEffect(() => {
    api<OrcFull>(`/orcamentos/${id}`).then(setOrc).catch(() => setErro('Não foi possível carregar'));
    void buscarLista<MecanicoOpt[]>('/auth/usuarios?perfil=MECANICO', avisos.erro, []).then(setMecanicos);
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

  const aprovar = () => {
    // O rápido precisa de cadastro antes da OS. A tela de lista tem o diálogo
    // que faz isso, então manda o atendente para lá em vez de mostrar um erro.
    if (orc && !orc.cliente) {
      avisos.info('Orçamento rápido: use "Aprovar → OS" na lista para informar o cliente e o veículo.');
      return onFechar();
    }
    return acao(async () => {
      const r = await api<AprovarResp>(`/orcamentos/${id}/aprovar`, { method: 'POST', body: { mecanicoId } });
      if (r.aguardandoPeca) avisos.info(`OS #${r.os.numero} gerada — aguardando peça (estoque insuficiente).`);
      else avisos.sucesso(`OS #${r.os.numero} gerada!`);
      onMudou();
      onFechar();
    });
  };
  const mudarStatus = (status: string) =>
    acao(async () => {
      await api(`/orcamentos/${id}/status`, { method: 'PATCH', body: { status } });
      onMudou();
      onFechar();
    });

  return (
    <>
    <Modal
      title={orc ? `Orçamento #${orc.numero}` : 'Orçamento'}
      size="lg"
      onClose={onFechar}
      footer={
        <>
          {orc && (
            <button onClick={() => setImprimir(true)} className="mr-auto inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border-[1.6px] border-linha font-bold text-petroleo hover:bg-fundo">
              <Printer size={16} /> Imprimir
            </button>
          )}
          {aprovavel && orc?.status === 'RASCUNHO' && <BtnGhost onClick={() => mudarStatus('ENVIADO')}>Marcar como enviado</BtnGhost>}
          {aprovavel && <BtnGhost onClick={() => mudarStatus('RECUSADO')}>Recusar</BtnGhost>}
          {aprovavel ? (
            <BtnPrimary onClick={aprovar} disabled={ocupado}>{ocupado ? '...' : <span className="inline-flex items-center gap-1.5"><Zap size={16} /> Aprovar → gerar OS</span>}</BtnPrimary>
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
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-petroleo">
                {orc.cliente?.nome ?? orc.contatoNome ?? 'Sem identificação'}
              </span>
              {!orc.cliente && <Badge cor="bg-azul-bg text-azul">Rápido</Badge>}
            </div>
            {orc.carro ? (
              <div className="text-grafite/60">
                <span className="font-mono text-xs bg-grafite text-white px-1.5 py-0.5 rounded">{orc.carro.placa}</span> {orc.carro.marca} {orc.carro.modelo}
              </div>
            ) : (
              <div className="text-grafite/60">
                {[orc.contatoTelefone, orc.veiculoDescricao].filter(Boolean).join(' · ') || 'sem cliente e veículo cadastrados'}
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

          {orc.observacoes && (
            <div className="text-sm text-grafite/60 bg-amarelo-bg/40 rounded-lg p-3 flex gap-2">
              <StickyNote size={16} className="shrink-0 mt-0.5 text-amarelo" />
              <span>{orc.observacoes}</span>
            </div>
          )}

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
    {imprimir && orc && (
      <DocumentoImpressao onFechar={() => setImprimir(false)}>
        <OrcamentoDoc orc={orc} />
      </DocumentoImpressao>
    )}
    </>
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

// ------------------------------------------------------------------
// Identificar um orçamento rápido: dá a ele um cliente e um veículo.
//
// Aparece quando o cliente do "só queria saber o preço" resolveu fazer o
// serviço. É aqui — e só aqui — que o cadastro deixa de ser opcional, porque
// a OS baixa estoque, dá garantia e entra no histórico do carro.
// ------------------------------------------------------------------
function IdentificarOrcamento({
  orc,
  onFechar,
  onPronto,
}: {
  orc: OrcItem;
  onFechar: () => void;
  onPronto: (mensagem: string) => void;
}) {
  const avisos = useAvisos();
  const [clientes, setClientes] = useState<ClienteOpt[]>([]);
  const [carros, setCarros] = useState<CarroOpt[]>([]);
  const [clienteId, setClienteId] = useState('');
  const [carroId, setCarroId] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    void buscarLista<ClienteOpt[]>('/clientes', avisos.erro, []).then(setClientes);
    void buscarLista<CarroOpt[]>('/carros', avisos.erro, []).then(setCarros);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carrosDoCliente = useMemo(() => carros.filter((c) => c.clienteId === clienteId), [carros, clienteId]);

  async function executar(gerarOS: boolean) {
    if (!clienteId) return setErro('Selecione o cliente.');
    if (!carroId) return setErro('Selecione o veículo.');

    setOcupado(true);
    setErro('');
    try {
      if (gerarOS) {
        const r = await api<AprovarResp>(`/orcamentos/${orc.id}/aprovar`, { method: 'POST', body: { clienteId, carroId } });
        onPronto(
          r.aguardandoPeca
            ? `OS #${r.os.numero} gerada — nasce aguardando peça (estoque insuficiente).`
            : `OS #${r.os.numero} gerada!`,
        );
      } else {
        await api(`/orcamentos/${orc.id}/identificar`, { method: 'PATCH', body: { clienteId, carroId } });
        onPronto(`Orçamento #${orc.numero} agora está no nome do cliente.`);
      }
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível concluir');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal
      title={`Identificar orçamento #${orc.numero}`}
      onClose={onFechar}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnGhost onClick={() => void executar(false)}>Só vincular</BtnGhost>
          <BtnPrimary onClick={() => void executar(true)} disabled={ocupado}>
            {ocupado ? 'Aguarde...' : 'Vincular e gerar OS'}
          </BtnPrimary>
        </>
      }
    >
      <div className="bg-azul-bg text-azul rounded-xl px-3.5 py-2.5 text-sm">
        Este é um orçamento <b>rápido</b>
        {orc.contatoNome && <> de <b>{orc.contatoNome}</b></>}
        {orc.veiculoDescricao && <> ({orc.veiculoDescricao})</>}. Para virar Ordem de Serviço ele
        precisa de um cliente e de um veículo cadastrados — os itens e o valor não mudam.
      </div>

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
          <option value="">{clienteId ? (carrosDoCliente.length ? 'Selecione...' : 'Cliente sem veículo cadastrado') : 'Escolha o cliente'}</option>
          {carrosDoCliente.map((c) => (
            <option key={c.id} value={c.id}>{c.placa} — {c.marca} {c.modelo}</option>
          ))}
        </select>
      </Campo>

      <p className="text-xs text-grafite/50">
        Cliente ou veículo ainda sem cadastro? Cadastre em <b>Clientes</b> e <b>Carros</b>, depois volte aqui.
      </p>

      {erro && <div className="text-vermelho text-sm font-semibold">{erro}</div>}
    </Modal>
  );
}
