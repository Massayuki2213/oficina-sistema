import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarPlus, CheckCircle2, Plus, Receipt, Repeat, Wallet } from 'lucide-react';
import {
  FORMAS_SAIDA,
  LABEL_FORMA_PAGAMENTO,
  brl,
  type DespesaDTO,
  type FormaSaida,
  type FornecedorDTO,
  type ListaDespesasDTO,
} from '@hermes/shared';
import { ApiError, http, mensagemDeErro } from '../../api/http';
import { useListaPaginada } from '../../api/lista';
import { useAvisos } from '../../lib/avisos';
import { dataBR, hojeISO, paraDataISO } from '../../lib/format';
import { rangeDe, type PeriodoKey } from '../../lib/periodo';
import {
  AcaoEditar,
  AcaoExcluir,
  Badge,
  BtnGhost,
  BtnIcone,
  BtnPrimary,
  Campo,
  CampoBusca,
  ErroFormulario,
  EstadoTabela,
  InputDinheiro,
  Kpi,
  Marcador,
  Modal,
  PageHeader,
  Paginacao,
  Painel,
  Periodo,
  Selecao,
  inputCls,
  linhaCls,
  tdCls,
  thCls,
} from '../../components/ui';
import { PagarConta } from '../../components/PagarConta';

type Situacao = '' | 'PENDENTE' | 'VENCIDA' | 'PAGA';
const INVALIDAR = [['despesas'], ['caixa'], ['relatorios']];

export default function DespesasPage() {
  const qc = useQueryClient();
  const avisos = useAvisos();
  const [periodo, setPeriodo] = useState<PeriodoKey>('mes');
  const [situacao, setSituacao] = useState<Situacao>('');
  const [categoria, setCategoria] = useState('');
  const categorias = useQuery({ queryKey: ['despesas', 'categorias'], queryFn: () => http.get<string[]>('/despesas/categorias') });
  const lista = useListaPaginada<DespesaDTO, Pick<ListaDespesasDTO, 'totais'>>('despesas', '/despesas', {
    ...rangeDe(periodo),
    situacao: situacao || undefined,
    categoria: categoria || undefined,
  });
  const itens = lista.dados?.itens ?? [];
  const [editando, setEditando] = useState<DespesaDTO | 'nova' | null>(null);
  const [pagando, setPagando] = useState<DespesaDTO | null>(null);

  const atualizar = () => Promise.all(INVALIDAR.map((queryKey) => qc.invalidateQueries({ queryKey })));

  async function proximoMes(d: DespesaDTO) {
    try {
      const nova = await http.post<DespesaDTO>(`/despesas/${d.id}/proximo-mes`);
      await atualizar();
      avisos.sucesso(`${d.descricao} lançada para ${dataBR(nova.data)}.`);
    } catch (e) {
      avisos.erro(mensagemDeErro(e));
    }
  }

  async function excluir(d: DespesaDTO) {
    const ok = await avisos.confirmar({ titulo: 'Excluir esta despesa?', mensagem: `${d.descricao} — ${brl(d.valor)}.`, botao: 'Excluir', perigo: true });
    if (!ok) return;
    try {
      await http.delete(`/despesas/${d.id}`);
      await atualizar();
      avisos.sucesso('Despesa excluída.');
    } catch (e) {
      avisos.erro(mensagemDeErro(e));
    }
  }

  return (
    <div>
      <PageHeader title="Despesas" subtitle="Contas da oficina: aluguel, energia, salários, impostos">
        <CampoBusca valor={lista.busca} onBuscar={lista.setBusca} placeholder="Descrição..." />
        <BtnPrimary icone={Plus} onClick={() => setEditando('nova')}>
          Nova despesa
        </BtnPrimary>
      </PageHeader>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Periodo value={periodo} onChange={setPeriodo} />
        <Selecao value={situacao} onChange={(e) => setSituacao(e.target.value as Situacao)} className="!w-auto !py-2 text-sm" aria-label="Situação">
          <option value="">Todas</option>
          <option value="PENDENTE">A pagar</option>
          <option value="VENCIDA">Vencidas</option>
          <option value="PAGA">Pagas</option>
        </Selecao>
        <Selecao value={categoria} onChange={(e) => setCategoria(e.target.value)} className="!w-auto !py-2 text-sm" aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {(categorias.data ?? []).map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Selecao>
      </div>

      {lista.dados && (
        <div className="grid sm:grid-cols-3 gap-3 mb-5">
          <Kpi label="Total no período" valor={brl(lista.dados.totais.total)} icon={Receipt} cor="bg-azul-bg text-azul" />
          <Kpi label="Pago" valor={brl(lista.dados.totais.pago)} icon={CheckCircle2} cor="bg-verde-bg text-verde" />
          <Kpi label="A pagar" valor={brl(lista.dados.totais.aPagar)} icon={Wallet} cor="bg-amarelo-bg text-amarelo" />
        </div>
      )}

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Vencimento</th>
              <th className={thCls}>Descrição</th>
              <th className={thCls}>Categoria</th>
              <th className={thCls}>Situação</th>
              <th className={`${thCls} text-right`}>Valor</th>
              <th className={`${thCls} text-right`}>Ações</th>
            </tr>
          </thead>
          <tbody>
            <EstadoTabela
              carregando={lista.consulta.isPending}
              erro={lista.consulta.error}
              vazio={itens.length === 0}
              colSpan={6}
              textoVazio="Nenhuma despesa neste período."
              onTentar={() => void lista.consulta.refetch()}
            />
            {itens.map((d) => (
              <tr key={d.id} className={linhaCls}>
                <td className={`${tdCls} whitespace-nowrap ${d.vencida ? 'text-vermelho font-bold' : 'text-grafite/60'}`}>
                  {dataBR(d.data)}
                  {d.vencida && <AlertTriangle size={13} className="inline ml-1 -mt-0.5" />}
                </td>
                <td className={tdCls}>
                  <div className="font-bold flex items-center gap-1.5">
                    {d.descricao}
                    {d.recorrente && (
                      <span title="Conta fixa (todo mês)" className="text-grafite/40">
                        <Repeat size={13} />
                      </span>
                    )}
                  </div>
                  {d.fornecedor && <div className="text-xs text-grafite/45">{d.fornecedor.nome}</div>}
                </td>
                <td className={`${tdCls} text-grafite/60`}>{d.categoria}</td>
                <td className={tdCls}>
                  {d.pago ? (
                    <Badge cor="bg-verde-bg text-verde">
                      Paga {d.pagoEm ? dataBR(d.pagoEm) : ''}
                      {d.formaPagamento ? ` · ${LABEL_FORMA_PAGAMENTO[d.formaPagamento]}` : ''}
                    </Badge>
                  ) : d.vencida ? (
                    <Badge cor="bg-vermelho-bg text-vermelho">Vencida</Badge>
                  ) : (
                    <Badge cor="bg-amarelo-bg text-amarelo">A pagar</Badge>
                  )}
                </td>
                <td className={`${tdCls} text-right font-extrabold tabular-nums`}>{brl(d.valor)}</td>
                <td className={`${tdCls} text-right whitespace-nowrap`}>
                  {!d.pago && <BtnIcone icone={Wallet} titulo="Pagar" onClick={() => setPagando(d)} />}
                  {d.recorrente && <BtnIcone icone={CalendarPlus} titulo="Lançar a do próximo mês" onClick={() => void proximoMes(d)} />}
                  {!d.pago && <AcaoEditar onClick={() => setEditando(d)} />}
                  {!d.pago && <AcaoExcluir onClick={() => void excluir(d)} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Paginacao pagina={lista.pagina} porPagina={lista.porPagina} total={lista.dados?.total ?? 0} onPagina={lista.setPagina} />
      </Painel>

      {editando && <FormDespesa despesa={editando === 'nova' ? null : editando} categorias={categorias.data ?? []} onFechar={() => setEditando(null)} />}
      {pagando && (
        <PagarConta
          titulo={`Pagar: ${pagando.descricao}`}
          valor={pagando.valor}
          comData
          onFechar={() => setPagando(null)}
          onConfirmar={async (forma, data) => {
            await http.post(`/despesas/${pagando.id}/pagar`, { formaPagamento: forma, data });
            await atualizar();
            avisos.sucesso('Despesa paga — a saída entrou no caixa.');
          }}
        >
          Vencimento {dataBR(pagando.data)} · {pagando.categoria}
        </PagarConta>
      )}
    </div>
  );
}

function FormDespesa({ despesa, categorias, onFechar }: { despesa: DespesaDTO | null; categorias: string[]; onFechar: () => void }) {
  const qc = useQueryClient();
  const avisos = useAvisos();
  const fornecedores = useQuery({ queryKey: ['fornecedores'], queryFn: () => http.get<FornecedorDTO[]>('/fornecedores') });
  const [categoria, setCategoria] = useState(despesa?.categoria ?? '');
  const [descricao, setDescricao] = useState(despesa?.descricao ?? '');
  const [valor, setValor] = useState(despesa ? despesa.valor.toFixed(2) : '');
  const [data, setData] = useState(despesa ? paraDataISO(new Date(despesa.data)) : hojeISO());
  const [fornecedorId, setFornecedorId] = useState(despesa?.fornecedor?.id ?? '');
  const [recorrente, setRecorrente] = useState(despesa?.recorrente ?? false);
  const [jaPaga, setJaPaga] = useState(false);
  const [forma, setForma] = useState<FormaSaida>('PIX');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  async function salvar() {
    const corpo = { categoria: categoria.trim(), descricao: descricao.trim(), valor: Number(valor || 0), data, fornecedorId: fornecedorId || null, recorrente };
    setEnviando(true);
    setErros({});
    try {
      if (despesa) await http.put(`/despesas/${despesa.id}`, { ...corpo, versao: despesa.versao });
      else await http.post('/despesas', { ...corpo, pago: jaPaga, formaPagamento: jaPaga ? forma : null });
      await Promise.all(INVALIDAR.map((queryKey) => qc.invalidateQueries({ queryKey })));
      avisos.sucesso(despesa ? 'Despesa atualizada.' : jaPaga ? 'Despesa lançada e paga.' : 'Despesa lançada.');
      onFechar();
    } catch (e) {
      if (e instanceof ApiError && e.erros) setErros(Object.fromEntries(Object.entries(e.erros).map(([k, v]) => [k, v[0]])));
      else setErros({ geral: mensagemDeErro(e) });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      title={despesa ? 'Editar despesa' : 'Nova despesa'}
      onClose={onFechar}
      onEnviar={() => void salvar()}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary type="submit" disabled={enviando}>
            {enviando ? 'Salvando...' : 'Salvar'}
          </BtnPrimary>
        </>
      }
    >
      <Campo label="Descrição" erro={erros.descricao}>
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inputCls} maxLength={200} placeholder="Ex.: Aluguel do galpão" />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Categoria" erro={erros.categoria}>
          <input value={categoria} onChange={(e) => setCategoria(e.target.value)} className={inputCls} maxLength={60} list="categorias-despesa" placeholder="Ex.: Aluguel" />
          <datalist id="categorias-despesa">
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Campo>
        <Campo label="Valor" erro={erros.valor}>
          <InputDinheiro value={valor} onChange={setValor} />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Vencimento" erro={erros.data}>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Distribuidor (opcional)">
          <Selecao value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
            <option value="">— nenhum —</option>
            {(fornecedores.data ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
      </div>
      <Marcador checked={recorrente} onChange={setRecorrente} ajuda="Aluguel, internet, contador: um clique lança a do mês seguinte.">
        Conta fixa (todo mês)
      </Marcador>
      {!despesa && (
        <>
          <Marcador checked={jaPaga} onChange={setJaPaga} ajuda="A saída entra no caixa agora.">
            Já está paga
          </Marcador>
          {jaPaga && (
            <Campo label="Como foi paga">
              <Selecao value={forma} onChange={(e) => setForma(e.target.value as FormaSaida)}>
                {FORMAS_SAIDA.map((f) => (
                  <option key={f} value={f}>
                    {LABEL_FORMA_PAGAMENTO[f]}
                  </option>
                ))}
              </Selecao>
            </Campo>
          )}
        </>
      )}
      <ErroFormulario>{erros.geral}</ErroFormulario>
    </Modal>
  );
}
