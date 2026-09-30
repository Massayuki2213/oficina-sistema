import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Plus } from 'lucide-react';
import { LABEL_FORMA_PAGAMENTO, brl, formatarQtd, type VendaDTO, type VendaResumoDTO } from '@hermes/shared';
import { http } from '../../api/http';
import { useListaPaginada, useParametroDeTela } from '../../api/lista';
import { useAvisos } from '../../lib/avisos';
import { dataHoraBR } from '../../lib/format';
import { rangeDe, type PeriodoKey } from '../../lib/periodo';
import { useSessao } from '../acesso/sessao';
import { Badge, BtnGhost, BtnPrimary, CampoBusca, ErroAoCarregar, EstadoTabela, InfoLinha, Modal, PageHeader, Paginacao, Painel, Periodo, linhaCls, tdCls, thCls } from '../../components/ui';
import { JanelaMotivo } from '../../components/JanelaMotivo';
import { NovaVenda } from './NovaVenda';

export default function VendasPage() {
  const { pode } = useSessao();
  const [periodo, setPeriodo] = useState<PeriodoKey>('hoje');
  const lista = useListaPaginada<VendaResumoDTO>('vendas', '/vendas', rangeDe(periodo));
  const itens = lista.dados?.itens ?? [];
  const [nova, setNova] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);

  const [novaParam, limparNova] = useParametroDeTela('nova');
  useEffect(() => {
    if (novaParam && pode('receberPagamentos')) {
      setNova(true);
      limparNova();
    }
  }, [novaParam, limparNova, pode]);

  return (
    <div>
      <PageHeader title="Venda de balcão" subtitle="Peça vendida direto no balcão, sem OS">
        <CampoBusca valor={lista.busca} onBuscar={lista.setBusca} placeholder="Nº ou cliente..." />
        {pode('receberPagamentos') && (
          <BtnPrimary icone={Plus} onClick={() => setNova(true)}>
            Nova venda
          </BtnPrimary>
        )}
      </PageHeader>
      <div className="mb-4">
        <Periodo value={periodo} onChange={setPeriodo} />
      </div>

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Nº</th>
              <th className={thCls}>Quando</th>
              <th className={thCls}>Cliente</th>
              <th className={thCls}>Itens</th>
              <th className={thCls}>Pagamento</th>
              <th className={`${thCls} text-right`}>Total</th>
            </tr>
          </thead>
          <tbody>
            <EstadoTabela
              carregando={lista.consulta.isPending}
              erro={lista.consulta.error}
              vazio={itens.length === 0}
              colSpan={6}
              textoVazio="Nenhuma venda neste período."
              onTentar={() => void lista.consulta.refetch()}
            />
            {itens.map((v) => (
              <tr key={v.id} onClick={() => setAberta(v.id)} className={`${linhaCls} cursor-pointer ${v.cancelada ? 'opacity-60' : ''}`}>
                <td className={`${tdCls} font-mono font-bold text-grafite/50`}>#{v.numero}</td>
                <td className={`${tdCls} text-grafite/60 whitespace-nowrap`}>{dataHoraBR(v.data)}</td>
                <td className={tdCls}>{v.cliente?.nome ?? <span className="text-grafite/40">balcão</span>}</td>
                <td className={`${tdCls} text-grafite/60`}>{v.qtdItens} item(ns)</td>
                <td className={tdCls}>
                  {v.cancelada ? <Badge cor="bg-vermelho-bg text-vermelho">Cancelada</Badge> : LABEL_FORMA_PAGAMENTO[v.formaPagamento]}
                </td>
                <td className={`${tdCls} text-right font-extrabold tabular-nums ${v.cancelada ? 'line-through' : ''}`}>{brl(v.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Paginacao pagina={lista.pagina} porPagina={lista.porPagina} total={lista.dados?.total ?? 0} onPagina={lista.setPagina} />
      </Painel>

      {nova && (
        <NovaVenda
          onFechar={() => setNova(false)}
          onVendida={(v) => {
            setNova(false);
            setAberta(v.id);
          }}
        />
      )}
      {aberta && <DetalheVenda id={aberta} onFechar={() => setAberta(null)} />}
    </div>
  );
}

function DetalheVenda({ id, onFechar }: { id: string; onFechar: () => void }) {
  const { pode } = useSessao();
  const qc = useQueryClient();
  const avisos = useAvisos();
  const consulta = useQuery({ queryKey: ['vendas', id], queryFn: () => http.get<VendaDTO>(`/vendas/${id}`) });
  const [cancelando, setCancelando] = useState(false);
  const v = consulta.data;

  return (
    <>
      <Modal
        title={v ? `Venda #${v.numero}` : 'Venda'}
        size="lg"
        onClose={onFechar}
        semConfirmarDescarte
        semFocoInicial
        footer={
          <>
            {v && !v.cancelada && pode('apagarRegistros') && (
              <BtnGhost icone={Ban} onClick={() => setCancelando(true)} className="mr-auto !text-vermelho">
                Cancelar venda
              </BtnGhost>
            )}
            <BtnGhost onClick={onFechar}>Fechar</BtnGhost>
          </>
        }
      >
        {!v ? (
          consulta.error ? (
            <ErroAoCarregar erro={consulta.error} onTentar={() => void consulta.refetch()} />
          ) : (
            <div className="text-center text-grafite/40 py-10 text-sm">Carregando...</div>
          )
        ) : (
          <>
            {v.cancelada && (
              <div className="bg-vermelho-bg text-vermelho rounded-xl px-3.5 py-2.5 text-sm font-bold">
                Cancelada {v.canceladaEm ? `em ${dataHoraBR(v.canceladaEm)}` : ''}
                {v.motivoCancelamento && <span className="font-normal"> — {v.motivoCancelamento}</span>}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 bg-fundo rounded-xl p-3 text-sm">
              <InfoLinha rotulo="Quando" valor={dataHoraBR(v.data)} />
              <InfoLinha rotulo="Cliente" valor={v.cliente?.nome ?? 'balcão'} />
              <InfoLinha rotulo="Pagamento" valor={LABEL_FORMA_PAGAMENTO[v.formaPagamento]} />
            </div>
            <div className="border border-linha rounded-xl divide-y divide-linha">
              {v.itens.map((i) => (
                <div key={i.id} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                  <span className="flex-1 min-w-0 truncate font-bold">{i.nome}</span>
                  <span className="text-grafite/60 tabular-nums">
                    {formatarQtd(i.quantidade, i.unidade)} × {brl(i.precoUnit)}
                  </span>
                  <span className="w-24 text-right font-bold tabular-nums">{brl(i.subtotal)}</span>
                </div>
              ))}
            </div>
            <div className="text-right text-sm space-y-0.5">
              {v.desconto > 0 && (
                <div className="text-grafite/55">
                  Subtotal {brl(v.subtotal)} · desconto <span className="text-vermelho">−{brl(v.desconto)}</span>
                </div>
              )}
              <div className="text-2xl font-extrabold text-petroleo tabular-nums">{brl(v.total)}</div>
              {v.usuario && <div className="text-xs text-grafite/45">vendido por {v.usuario}</div>}
            </div>
            {v.observacoes && <p className="text-sm text-grafite/65 whitespace-pre-wrap">{v.observacoes}</p>}
          </>
        )}
      </Modal>

      {v && cancelando && (
        <JanelaMotivo
          titulo={`Cancelar a venda #${v.numero}`}
          botao="Cancelar a venda"
          sugestoes={['Cliente devolveu a peça', 'Lançada errada']}
          onFechar={() => setCancelando(false)}
          onConfirmar={async (motivo) => {
            try {
              const r = await http.post<VendaDTO>(`/vendas/${v.id}/cancelar`, { motivo });
              qc.setQueryData(['vendas', v.id], r);
              await Promise.all([['vendas'], ['pecas'], ['caixa'], ['relatorios']].map((queryKey) => qc.invalidateQueries({ queryKey })));
              avisos.sucesso('Venda cancelada: as peças voltaram ao estoque e o valor saiu do caixa como estorno.');
              setCancelando(false);
            } catch (e) {
              avisos.erro(e instanceof Error ? e.message : 'Não foi possível cancelar.');
            }
          }}
        >
          As peças voltam para o estoque e o valor sai do caixa como estorno. A venda continua na lista, marcada como cancelada.
        </JanelaMotivo>
      )}
    </>
  );
}
