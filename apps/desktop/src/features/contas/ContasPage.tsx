import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, HandCoins, NotebookPen, Plus, Wallet } from 'lucide-react';
import {
  FORMAS_A_VISTA,
  LABEL_FORMA_PAGAMENTO,
  brl,
  dividirEmParcelas,
  type ClienteResumoDTO,
  type FormaAVista,
  type ListaContasDTO,
  type ParcelaDTO,
  type ResumoDevedoresDTO,
} from '@hermes/shared';
import { ApiError, http, mensagemDeErro } from '../../api/http';
import { buscarClientes, useOficina } from '../../api/catalogo';
import { useListaPaginada, useParametroDeTela } from '../../api/lista';
import { useAvisos } from '../../lib/avisos';
import { CORES_STATUS_PARCELA, LABEL_STATUS_PARCELA, dataBR, daquiDias, formatarTelefone, hojeISO, somarMeses } from '../../lib/format';
import { linkWhatsApp, mensagens } from '../../lib/whatsapp';
import { useSessao } from '../acesso/sessao';
import {
  Badge,
  BtnGhost,
  BtnIcone,
  BtnPrimary,
  BtnWhatsApp,
  BuscaSelect,
  Campo,
  CampoBusca,
  ErroFormulario,
  EstadoTabela,
  InputDinheiro,
  InputQuantidade,
  Kpi,
  Modal,
  PageHeader,
  Paginacao,
  Painel,
  inputCls,
  linhaCls,
  tdCls,
  thCls,
} from '../../components/ui';

type Filtro = 'abertas' | 'atrasadas' | 'pagas' | 'todas';

const FILTROS: { id: Filtro; rotulo: string; query: Record<string, string | boolean | undefined> }[] = [
  { id: 'abertas', rotulo: 'Em aberto', query: { status: 'PENDENTE' } },
  { id: 'atrasadas', rotulo: 'Em atraso', query: { atrasadas: true } },
  { id: 'pagas', rotulo: 'Pagas', query: { status: 'PAGA' } },
  { id: 'todas', rotulo: 'Todas', query: {} },
];

const INVALIDAR = [['contas-receber'], ['caixa'], ['clientes'], ['alertas'], ['relatorios'], ['ordens']];

export default function ContasPage() {
  const { pode } = useSessao();
  const avisos = useAvisos();
  const oficina = useOficina();
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>('abertas');
  const [cliente, setCliente] = useState<{ id: string; nome: string } | null>(null);
  const resumo = useQuery({ queryKey: ['contas-receber', 'resumo'], queryFn: () => http.get<ResumoDevedoresDTO>('/contas-receber/resumo') });
  const lista = useListaPaginada<ParcelaDTO, Pick<ListaContasDTO, 'totais'>>('contas-receber', '/contas-receber', {
    ...FILTROS.find((f) => f.id === filtro)!.query,
    clienteId: cliente?.id,
  });
  const itens = lista.dados?.itens ?? [];
  const [recebendo, setRecebendo] = useState<ParcelaDTO | null>(null);
  const [lancando, setLancando] = useState(false);

  // /contas-receber?cliente=<id> (da ficha do cliente)
  const [clienteParam, limparCliente, params] = useParametroDeTela('cliente');
  useEffect(() => {
    if (clienteParam) {
      setCliente({ id: clienteParam, nome: params.get('nome') ?? 'cliente' });
      limparCliente();
    }
  }, [clienteParam, limparCliente, params]);

  async function cancelar(p: ParcelaDTO) {
    const ok = await avisos.confirmar({
      titulo: 'Cancelar esta parcela?',
      mensagem: `${p.cliente.nome} deixa de dever ${brl(p.saldo)} desta parcela. Use para dívida perdoada ou lançada errada.`,
      botao: 'Cancelar parcela',
      perigo: true,
    });
    if (!ok) return;
    try {
      await http.post(`/contas-receber/${p.id}/cancelar`);
      await Promise.all(INVALIDAR.map((queryKey) => qc.invalidateQueries({ queryKey })));
      avisos.sucesso('Parcela cancelada.');
    } catch (e) {
      avisos.erro(mensagemDeErro(e));
    }
  }

  const r = resumo.data;
  return (
    <div>
      <PageHeader title="Contas a receber" subtitle="Fiado e parcelado: quem deve, quanto e desde quando">
        <CampoBusca valor={lista.busca} onBuscar={lista.setBusca} placeholder="Nome do cliente..." />
        <BtnPrimary icone={NotebookPen} onClick={() => setLancando(true)} titulo="Passar o caderno de fiado para o sistema">
          Lançar fiado
        </BtnPrimary>
      </PageHeader>

      {r && (
        <div className="grid sm:grid-cols-3 gap-3 mb-5">
          <Kpi label="Total a receber" valor={brl(r.totalReceber)} icon={Wallet} cor="bg-azul-bg text-azul" sub={`${r.clientes.length} cliente(s)`} />
          <Kpi
            label="Em atraso"
            valor={brl(r.totalEmAtraso)}
            icon={AlertTriangle}
            cor={r.totalEmAtraso > 0 ? 'bg-vermelho-bg text-vermelho' : 'bg-fundo text-grafite/40'}
            sub={`${r.clientes.filter((c) => c.temAtraso).length} cliente(s) com parcela vencida`}
          />
          <div className="bg-white rounded-2xl p-4 border border-linha shadow-sm min-w-0">
            <div className="text-[13px] text-grafite/50 font-semibold mb-2">Quem mais deve</div>
            <div className="space-y-1">
              {r.clientes.slice(0, 3).map((d) => (
                <button
                  key={d.cliente.id}
                  type="button"
                  onClick={() => setCliente(d.cliente)}
                  className="w-full flex items-center justify-between gap-2 text-sm hover:underline text-left"
                >
                  <span className={`truncate font-semibold ${d.temAtraso ? 'text-vermelho' : ''}`}>{d.cliente.nome}</span>
                  <span className="font-bold tabular-nums">{brl(d.totalDevido)}</span>
                </button>
              ))}
              {r.clientes.length === 0 && <div className="text-sm text-grafite/40">Ninguém devendo.</div>}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1 bg-white border border-linha rounded-xl p-1" role="tablist">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filtro === f.id}
              onClick={() => setFiltro(f.id)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition whitespace-nowrap ${filtro === f.id ? 'bg-petroleo text-white shadow-sm' : 'text-grafite/60 hover:bg-fundo'}`}
            >
              {f.rotulo}
            </button>
          ))}
        </div>
        {cliente && (
          <span className="inline-flex items-center gap-2 bg-laranja/10 text-laranja font-bold text-sm rounded-full pl-3 pr-1 py-1">
            Só {cliente.nome}
            <button type="button" onClick={() => setCliente(null)} className="rounded-full hover:bg-laranja/20 px-2" aria-label="Tirar filtro de cliente">
              ×
            </button>
          </span>
        )}
      </div>

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Cliente</th>
              <th className={thCls}>Referente a</th>
              <th className={thCls}>Parcela</th>
              <th className={thCls}>Vencimento</th>
              <th className={`${thCls} text-right`}>Valor</th>
              <th className={`${thCls} text-right`}>Falta</th>
              <th className={`${thCls} text-right`}>Ações</th>
            </tr>
          </thead>
          <tbody>
            <EstadoTabela
              carregando={lista.consulta.isPending}
              erro={lista.consulta.error}
              vazio={itens.length === 0}
              colSpan={7}
              textoVazio={filtro === 'atrasadas' ? 'Nenhuma parcela em atraso.' : 'Nenhuma parcela aqui.'}
              onTentar={() => void lista.consulta.refetch()}
            />
            {itens.map((p) => (
              <tr key={p.id} className={linhaCls}>
                <td className={tdCls}>
                  <button type="button" onClick={() => setCliente(p.cliente)} className="font-bold hover:underline text-left">
                    {p.cliente.nome}
                  </button>
                  <div className="text-xs text-grafite/45">{formatarTelefone(p.cliente.whatsapp ?? p.cliente.telefone)}</div>
                </td>
                <td className={`${tdCls} text-grafite/60`}>
                  {p.os ? (
                    <Link to={`/ordens?abrir=${p.os.id}`} className="font-bold hover:underline">
                      OS #{p.os.numero}
                    </Link>
                  ) : (
                    (p.descricao ?? '—')
                  )}
                </td>
                <td className={`${tdCls} tabular-nums text-grafite/60`}>
                  {p.parcela}/{p.totalParcelas}
                </td>
                <td className={`${tdCls} whitespace-nowrap`}>
                  <span className={p.emAtraso ? 'text-vermelho font-bold' : 'text-grafite/60'}>{dataBR(p.vencimento)}</span>
                  <div className="mt-0.5">
                    <Badge cor={p.emAtraso ? 'bg-vermelho-bg text-vermelho' : CORES_STATUS_PARCELA[p.status]}>{p.emAtraso ? 'Em atraso' : LABEL_STATUS_PARCELA[p.status]}</Badge>
                  </div>
                </td>
                <td className={`${tdCls} text-right tabular-nums text-grafite/60`}>{brl(p.valor)}</td>
                <td className={`${tdCls} text-right tabular-nums font-extrabold`}>{p.status === 'PENDENTE' ? brl(p.saldo) : '—'}</td>
                <td className={`${tdCls} text-right whitespace-nowrap`}>
                  {p.status === 'PENDENTE' && (
                    <>
                      <BtnWhatsApp compacto href={linkWhatsApp(p.cliente.whatsapp ?? p.cliente.telefone, mensagens.cobranca(p, oficina))}>
                        Cobrar
                      </BtnWhatsApp>
                      <BtnIcone icone={HandCoins} titulo="Receber" onClick={() => setRecebendo(p)} />
                      {pode('apagarRegistros') && <BtnIcone icone={Ban} titulo="Cancelar parcela" perigo onClick={() => void cancelar(p)} />}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Paginacao pagina={lista.pagina} porPagina={lista.porPagina} total={lista.dados?.total ?? 0} onPagina={lista.setPagina} />
      </Painel>

      {recebendo && <ReceberParcela parcela={recebendo} onFechar={() => setRecebendo(null)} />}
      {lancando && <LancarFiado onFechar={() => setLancando(false)} />}
    </div>
  );
}

function ReceberParcela({ parcela, onFechar }: { parcela: ParcelaDTO; onFechar: () => void }) {
  const qc = useQueryClient();
  const avisos = useAvisos();
  const [valor, setValor] = useState(parcela.saldo.toFixed(2));
  const [forma, setForma] = useState<FormaAVista>('PIX');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const v = Number(valor || 0);
  const parcial = v > 0 && v < parcela.saldo;

  async function receber() {
    if (v <= 0) return setErro('Informe o valor recebido.');
    if (v > parcela.saldo) return setErro(`O saldo desta parcela é ${brl(parcela.saldo)}.`);
    setEnviando(true);
    try {
      await http.post<ParcelaDTO>(`/contas-receber/${parcela.id}/receber`, { formaPagamento: forma, valor: v });
      await Promise.all(INVALIDAR.map((queryKey) => qc.invalidateQueries({ queryKey })));
      avisos.sucesso(parcial ? `Recebido ${brl(v)}. Ainda faltam ${brl(parcela.saldo - v)}.` : 'Parcela quitada.');
      onFechar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      title={`Receber de ${parcela.cliente.nome}`}
      onClose={onFechar}
      onEnviar={() => void receber()}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Voltar</BtnGhost>
          <BtnPrimary type="submit" disabled={enviando}>
            {enviando ? 'Registrando...' : parcial ? 'Receber parte' : 'Quitar parcela'}
          </BtnPrimary>
        </>
      }
    >
      <div className="text-sm text-grafite/65">
        Parcela {parcela.parcela}/{parcela.totalParcelas}
        {parcela.os ? ` da OS #${parcela.os.numero}` : parcela.descricao ? ` — ${parcela.descricao}` : ''}, venc. {dataBR(parcela.vencimento)}. Saldo:{' '}
        <strong className="text-petroleo">{brl(parcela.saldo)}</strong>
      </div>
      <Campo label="Valor recebido" ajuda={parcial ? `Baixa parcial: ficam ${brl(parcela.saldo - v)} para depois.` : undefined}>
        <InputDinheiro value={valor} onChange={setValor} autoFocus />
      </Campo>
      <Campo label="Forma">
        <div className="flex bg-fundo rounded-lg p-1 gap-1" role="radiogroup" aria-label="Forma">
          {FORMAS_A_VISTA.map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={forma === f}
              onClick={() => setForma(f)}
              className={`flex-1 px-3 py-2 rounded-md text-sm font-bold transition ${forma === f ? 'bg-white text-petroleo shadow-sm' : 'text-grafite/55'}`}
            >
              {LABEL_FORMA_PAGAMENTO[f]}
            </button>
          ))}
        </div>
      </Campo>
      <ErroFormulario>{erro}</ErroFormulario>
    </Modal>
  );
}

/** Fiado lançado à mão — sobretudo na implantação, para passar o caderno de fiado para o sistema. */
function LancarFiado({ onFechar }: { onFechar: () => void }) {
  const qc = useQueryClient();
  const avisos = useAvisos();
  const [cliente, setCliente] = useState<ClienteResumoDTO | null>(null);
  const [descricao, setDescricao] = useState('Fiado do caderno');
  const [valor, setValor] = useState('');
  const [parcelas, setParcelas] = useState('1');
  const [vencimento, setVencimento] = useState(daquiDias(30));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const n = Math.min(24, Math.max(1, Number(parcelas) || 1));
  const v = Number(valor || 0);

  async function salvar() {
    if (!cliente) return setErros({ clienteId: 'Escolha o cliente' });
    setEnviando(true);
    setErros({});
    try {
      await http.post('/contas-receber', { clienteId: cliente.id, descricao: descricao.trim(), valor: v, parcelas: n, primeiroVencimento: vencimento });
      await Promise.all(INVALIDAR.map((queryKey) => qc.invalidateQueries({ queryKey })));
      avisos.sucesso(`${brl(v)} lançado para ${cliente.nome}.`);
      onFechar();
    } catch (e) {
      if (e instanceof ApiError && e.erros) setErros(Object.fromEntries(Object.entries(e.erros).map(([k, m]) => [k, m[0]])));
      else setErros({ geral: mensagemDeErro(e) });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      title="Lançar fiado"
      onClose={onFechar}
      onEnviar={() => void salvar()}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary type="submit" icone={Plus} disabled={enviando}>
            {enviando ? 'Salvando...' : 'Lançar'}
          </BtnPrimary>
        </>
      }
    >
      <p className="text-sm text-grafite/60">Para dívida que não veio de uma OS — por exemplo, passar o caderno de fiado para o sistema.</p>
      <Campo label="Cliente" erro={erros.clienteId}>
        <BuscaSelect<ClienteResumoDTO>
          valor={cliente}
          onChange={setCliente}
          chave="clientes"
          buscar={buscarClientes}
          id={(c) => c.id}
          rotulo={(c) => c.nome}
          detalhe={(c) => formatarTelefone(c.telefone ?? c.whatsapp) || 'sem telefone'}
          placeholder="Nome, CPF ou telefone"
        />
      </Campo>
      <Campo label="Descrição" erro={erros.descricao}>
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inputCls} maxLength={200} />
      </Campo>
      <div className="grid grid-cols-3 gap-3">
        <Campo label="Valor total" erro={erros.valor}>
          <InputDinheiro value={valor} onChange={setValor} />
        </Campo>
        <Campo label="Parcelas" erro={erros.parcelas}>
          <InputQuantidade value={parcelas} onChange={setParcelas} inteiro ariaLabel="Parcelas" />
        </Campo>
        <Campo label="1º vencimento" erro={erros.primeiroVencimento}>
          <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={inputCls} />
        </Campo>
      </div>
      {v > 0 && n > 1 && (
        <div className="text-xs text-grafite/60 space-y-0.5">
          {dividirEmParcelas(v, n).map((x, i) => (
            <div key={i} className="flex justify-between tabular-nums">
              <span>
                {i + 1}/{n} · vence {dataBR(somarMeses(vencimento || hojeISO(), i))}
              </span>
              <span className="font-bold">{brl(x)}</span>
            </div>
          ))}
        </div>
      )}
      <ErroFormulario>{erros.geral}</ErroFormulario>
    </Modal>
  );
}
