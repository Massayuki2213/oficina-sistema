import { useState, type ReactNode } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Download, Package, Receipt, Scale, Table2, TrendingUp, Wallet } from 'lucide-react';
import {
  LABEL_ORIGEM_LANCAMENTO,
  brl,
  formatarQtd,
  percentual,
  type MesEvolucaoDTO,
  type OrigemLancamento,
  type PorCategoriaDTO,
  type ProdutividadeDTO,
  type RankingsDTO,
  type RelatorioEstoqueDTO,
  type ResumoFinanceiroDTO,
} from '@hermes/shared';
import { http } from '../../api/http';
import { baixarCSV } from '../../lib/csv';
import { dataBR, mesCurtoBR } from '../../lib/format';
import { rangeDe, rotuloPeriodo, type PeriodoKey } from '../../lib/periodo';
import { BtnGhost, ErroAoCarregar, Kpi, PageHeader, Periodo, tdCls, thCls } from '../../components/ui';
import { CORES_SERIES, GraficoEvolucao } from './GraficoEvolucao';

// ============================================================
// Relatórios do Dono: o que entrou, o que saiu, o que sobrou — e
// de onde. Um filtro de período no topo vale para tudo abaixo.
// ============================================================

export default function RelatoriosPage() {
  const [periodo, setPeriodo] = useState<PeriodoKey>('mes');
  const faixa = rangeDe(periodo);
  const q = <T,>(nome: string, caminho: string, extra?: Record<string, string | number | undefined>) => ({
    queryKey: ['relatorios', nome, periodo],
    queryFn: () => http.get<T>(caminho, { ...faixa, ...extra }),
  });

  const resumo = useQuery(q<ResumoFinanceiroDTO>('resumo', '/relatorios/resumo'));
  const categorias = useQuery(q<PorCategoriaDTO>('categorias', '/relatorios/por-categoria'));
  const rankings = useQuery(q<RankingsDTO>('rankings', '/relatorios/rankings'));
  const produtividade = useQuery(q<ProdutividadeDTO>('produtividade', '/relatorios/produtividade'));
  const evolucao = useQuery({ queryKey: ['relatorios', 'evolucao'], queryFn: () => http.get<{ meses: MesEvolucaoDTO[] }>('/relatorios/evolucao', { meses: 12 }).then((r) => r.meses) });
  const estoque = useQuery({ queryKey: ['relatorios', 'estoque'], queryFn: () => http.get<RelatorioEstoqueDTO>('/relatorios/estoque') });

  const r = resumo.data;

  return (
    <div className="space-y-5">
      <PageHeader title="Relatórios" subtitle="Lucro de verdade: aporte e retirada do dono ficam de fora" />
      <div className="flex items-center gap-3 flex-wrap -mt-2">
        <Periodo value={periodo} onChange={setPeriodo} />
        {r && (
          <BtnGhost icone={Download} className="text-sm" onClick={() => exportarResumo(r, periodo)}>
            Exportar resumo
          </BtnGhost>
        )}
      </div>

      {resumo.error ? (
        <ErroAoCarregar erro={resumo.error} onTentar={() => void resumo.refetch()} />
      ) : (
        <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 transition-opacity ${resumo.isFetching && r ? 'opacity-60' : ''}`}>
          <Kpi label="Faturamento" valor={r ? brl(r.faturamento) : '—'} icon={TrendingUp} cor="bg-azul-bg text-azul" sub={r && r.estornos > 0 ? `já descontados ${brl(r.estornos)} de estornos` : undefined} />
          <Kpi label="Despesas" valor={r ? brl(r.despesas) : '—'} icon={Receipt} cor="bg-amarelo-bg text-amarelo" sub="contas e compras pagas" />
          <Kpi
            label="Lucro"
            valor={r ? <span className={r.lucro < 0 ? 'text-vermelho' : 'text-verde'}>{brl(r.lucro)}</span> : '—'}
            icon={Scale}
            cor={r && r.lucro < 0 ? 'bg-vermelho-bg text-vermelho' : 'bg-verde-bg text-verde'}
            sub={r && r.faturamento > 0 ? `${percentual(r.lucro, r.faturamento).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% do faturamento` : undefined}
          />
          <Kpi label="Ticket médio" valor={r ? brl(r.ticketMedio) : '—'} icon={Wallet} cor="bg-fundo text-grafite/50" sub={r ? `${r.numOrdens} OS entregues` : undefined} />
        </div>
      )}

      {r && (
        <div className="grid md:grid-cols-3 gap-4">
          <Cartao titulo="De onde veio o dinheiro">
            <Linha rotulo="Mão de obra (serviços)" valor={brl(r.receitaServicos)} />
            <Linha rotulo="Peças nas OS" valor={brl(r.receitaPecas)} />
            <Linha rotulo="Venda de balcão" valor={brl(r.vendasBalcao)} />
          </Cartao>
          <Cartao titulo="Margem das peças">
            <Linha rotulo="Vendido" valor={brl(r.receitaPecas)} />
            <Linha rotulo="Custo das peças vendidas" valor={`−${brl(r.custoPecasVendidas)}`} />
            <Linha
              rotulo="Lucro bruto"
              valor={`${brl(r.lucroBrutoPecas)}${r.receitaPecas > 0 ? ` (${percentual(r.lucroBrutoPecas, r.receitaPecas).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%)` : ''}`}
              forte
            />
          </Cartao>
          <Cartao titulo="Dinheiro do dono (fora do lucro)">
            <Linha rotulo="Aportes" valor={brl(r.aportes)} />
            <Linha rotulo="Retiradas" valor={brl(r.retiradas)} />
            <Linha rotulo="Estornos no período" valor={brl(r.estornos)} />
          </Cartao>
        </div>
      )}

      <Evolucao consulta={evolucao} />

      <div className="grid lg:grid-cols-2 gap-4">
        <Cartao titulo={`Despesas por categoria · ${rotuloPeriodo(periodo)}`}>
          {categorias.data && (
            <Barras
              itens={Object.entries(categorias.data.despesasPorCategoria)
                .map(([nome, valor]) => ({ nome, valor }))
                .sort((a, b) => b.valor - a.valor)}
              cor={CORES_SERIES.despesas}
            />
          )}
        </Cartao>
        <Cartao titulo={`Entradas por origem · ${rotuloPeriodo(periodo)}`}>
          {categorias.data && (
            <Barras
              itens={(Object.entries(categorias.data.entradasPorOrigem) as [OrigemLancamento, number][])
                .map(([o, valor]) => ({ nome: LABEL_ORIGEM_LANCAMENTO[o], valor }))
                .sort((a, b) => b.valor - a.valor)}
              cor={CORES_SERIES.faturamento}
            />
          )}
        </Cartao>
      </div>

      {rankings.data && (
        <div className="grid lg:grid-cols-3 gap-4">
          <Ranking titulo="Serviços mais feitos" linhas={rankings.data.servicosMaisVendidos.map((s) => [s.nome, `${formatarQtd(s.quantidade)}×`, brl(s.receita)])} />
          <Ranking titulo="Peças mais usadas" linhas={rankings.data.pecasMaisUsadas.map((p) => [p.nome, formatarQtd(p.quantidade), brl(p.receita)])} />
          <Ranking titulo="Melhores clientes" linhas={rankings.data.clientesTop.map((c) => [c.nome, `${c.ordens} OS`, brl(c.total)])} />
        </div>
      )}

      {produtividade.data && <Produtividade dados={produtividade.data} periodo={periodo} />}
      {estoque.data && <Estoque dados={estoque.data} />}
    </div>
  );
}

function exportarResumo(r: ResumoFinanceiroDTO, periodo: PeriodoKey) {
  const linhas: [string, number][] = [
    ['Faturamento', r.faturamento],
    ['Despesas', r.despesas],
    ['Lucro', r.lucro],
    ['Receita de serviços', r.receitaServicos],
    ['Receita de peças', r.receitaPecas],
    ['Custo das peças vendidas', r.custoPecasVendidas],
    ['Lucro bruto das peças', r.lucroBrutoPecas],
    ['Vendas de balcão', r.vendasBalcao],
    ['Aportes', r.aportes],
    ['Retiradas', r.retiradas],
    ['Estornos', r.estornos],
    ['OS entregues', r.numOrdens],
    ['Ticket médio', r.ticketMedio],
  ];
  baixarCSV(
    `resumo-${periodo}${r.periodo.de ? `-${r.periodo.de}` : ''}`,
    [
      { titulo: 'Indicador', valor: (l) => l[0] },
      { titulo: 'Valor', valor: (l) => l[1] },
    ],
    linhas,
  );
}

function Cartao({ titulo, children, acao }: { titulo: string; children: ReactNode; acao?: ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-linha shadow-sm p-4 min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-extrabold text-petroleo flex-1">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 text-sm py-1 ${forte ? 'border-t border-linha mt-1 pt-2' : ''}`}>
      <span className="text-grafite/65">{rotulo}</span>
      <span className={`tabular-nums ${forte ? 'font-extrabold text-petroleo' : 'font-bold'}`}>{valor}</span>
    </div>
  );
}

/** Barras horizontais de uma série só: uma cor, valor na ponta. */
function Barras({ itens, cor }: { itens: { nome: string; valor: number }[]; cor: string }) {
  if (itens.length === 0) return <div className="text-sm text-grafite/40 py-4 text-center">Nada no período.</div>;
  const maior = Math.max(...itens.map((i) => i.valor), 1);
  const mostrados = itens.slice(0, 7);
  const resto = itens.slice(7).reduce((s, i) => s + i.valor, 0);
  const lista = resto > 0 ? [...mostrados, { nome: 'Outras', valor: resto }] : mostrados;
  return (
    <div className="space-y-2">
      {lista.map((i) => (
        <div key={i.nome} className="grid grid-cols-[8rem_1fr] sm:grid-cols-[10rem_1fr] items-center gap-3 text-sm" title={`${i.nome}: ${brl(i.valor)}`}>
          <span className="truncate text-grafite/70">{i.nome}</span>
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-4 rounded-r-[4px]" style={{ width: `${Math.max(1, (i.valor / maior) * 75)}%`, background: cor }} />
            <span className="font-bold tabular-nums text-grafite whitespace-nowrap">{brl(i.valor)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Ranking({ titulo, linhas }: { titulo: string; linhas: [string, string, string][] }) {
  return (
    <Cartao titulo={titulo}>
      {linhas.length === 0 && <div className="text-sm text-grafite/40 py-4 text-center">Nada no período.</div>}
      <ol className="space-y-1.5">
        {linhas.slice(0, 8).map(([nome, qtd, valor], i) => (
          <li key={nome + i} className="flex items-center gap-2 text-sm">
            <span className="w-5 text-right text-xs font-bold text-grafite/35 tabular-nums">{i + 1}</span>
            <span className="flex-1 min-w-0 truncate font-semibold">{nome}</span>
            <span className="text-xs text-grafite/50 tabular-nums">{qtd}</span>
            <span className="font-bold tabular-nums w-24 text-right">{valor}</span>
          </li>
        ))}
      </ol>
    </Cartao>
  );
}

function Evolucao({ consulta }: { consulta: UseQueryResult<MesEvolucaoDTO[]> }) {
  const [tabela, setTabela] = useState(false);
  const dados = consulta.data ?? [];
  return (
    <Cartao
      titulo="Últimos 12 meses"
      acao={
        <BtnGhost icone={Table2} onClick={() => setTabela((t) => !t)} className="!py-1.5 !px-3 text-sm">
          {tabela ? 'Ver gráfico' : 'Ver tabela'}
        </BtnGhost>
      }
    >
      {consulta.error ? (
        <ErroAoCarregar erro={consulta.error} onTentar={() => void consulta.refetch()} />
      ) : consulta.isPending ? (
        <div className="h-72 grid place-items-center text-sm text-grafite/40">Carregando...</div>
      ) : tabela ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="border-b border-linha">
                <th className={thCls}>Mês</th>
                <th className={`${thCls} text-right`}>Faturamento</th>
                <th className={`${thCls} text-right`}>Despesas</th>
                <th className={`${thCls} text-right`}>Lucro</th>
                <th className={`${thCls} text-right`}>OS</th>
              </tr>
            </thead>
            <tbody>
              {dados.map((m) => (
                <tr key={m.mes} className="border-b border-fundo last:border-0">
                  <td className={tdCls}>{mesCurtoBR(m.mes)}</td>
                  <td className={`${tdCls} text-right tabular-nums`}>{brl(m.faturamento)}</td>
                  <td className={`${tdCls} text-right tabular-nums`}>{brl(m.despesas)}</td>
                  <td className={`${tdCls} text-right tabular-nums font-bold ${m.lucro < 0 ? 'text-vermelho' : ''}`}>{brl(m.lucro)}</td>
                  <td className={`${tdCls} text-right tabular-nums`}>{m.numOrdens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <GraficoEvolucao dados={dados} />
      )}
    </Cartao>
  );
}

function Produtividade({ dados, periodo }: { dados: ProdutividadeDTO; periodo: PeriodoKey }) {
  return (
    <Cartao
      titulo={`Produtividade e comissão · ${rotuloPeriodo(periodo)}`}
      acao={
        dados.mecanicos.length > 0 && (
          <BtnGhost
            icone={Download}
            className="!py-1.5 !px-3 text-sm"
            onClick={() =>
              baixarCSV(
                `comissao-${periodo}`,
                [
                  { titulo: 'Mecânico', valor: (m) => m.nome },
                  { titulo: 'OS', valor: (m) => m.ordens },
                  { titulo: 'Mão de obra', valor: (m) => m.receitaServicos },
                  { titulo: 'Comissão %', valor: (m) => m.comissaoPct },
                  { titulo: 'Comissão R$', valor: (m) => m.comissao },
                  { titulo: 'Tempo médio (h)', valor: (m) => m.tempoMedioHoras },
                ],
                dados.mecanicos,
              )
            }
          >
            Planilha
          </BtnGhost>
        )
      }
    >
      {dados.mecanicos.length === 0 ? (
        <div className="text-sm text-grafite/40 py-4 text-center">Nenhuma OS com mecânico no período.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="border-b border-linha">
                <th className={thCls}>Mecânico</th>
                <th className={`${thCls} text-right`}>OS</th>
                <th className={`${thCls} text-right`}>Mão de obra</th>
                <th className={`${thCls} text-right`}>Comissão</th>
                <th className={`${thCls} text-right`}>Tempo médio</th>
              </tr>
            </thead>
            <tbody>
              {dados.mecanicos.map((m) => (
                <tr key={m.id} className="border-b border-fundo last:border-0">
                  <td className={`${tdCls} font-bold`}>{m.nome}</td>
                  <td className={`${tdCls} text-right tabular-nums`}>{m.ordens}</td>
                  <td className={`${tdCls} text-right tabular-nums`}>{brl(m.receitaServicos)}</td>
                  <td className={`${tdCls} text-right tabular-nums`}>
                    {m.comissaoPct != null ? (
                      <>
                        <strong>{brl(m.comissao)}</strong> <span className="text-xs text-grafite/45">({m.comissaoPct.toLocaleString('pt-BR')}%)</span>
                      </>
                    ) : (
                      <span className="text-grafite/40">sem comissão</span>
                    )}
                  </td>
                  <td className={`${tdCls} text-right tabular-nums text-grafite/60`}>
                    {m.tempoMedioHoras != null ? `${m.tempoMedioHoras.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Cartao>
  );
}

function Estoque({ dados }: { dados: RelatorioEstoqueDTO }) {
  const parado = dados.parados.reduce((s, p) => s + p.valorParado, 0);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Valor em estoque (custo)" valor={brl(dados.valorEstoque)} icon={Package} cor="bg-azul-bg text-azul" />
        <Kpi label="Itens ativos" valor={dados.itensAtivos} icon={Package} cor="bg-fundo text-grafite/50" />
        <Kpi label="Abaixo do mínimo" valor={dados.abaixoMinimo} icon={Package} cor={dados.abaixoMinimo > 0 ? 'bg-amarelo-bg text-amarelo' : 'bg-fundo text-grafite/50'} />
        <Kpi label="Dinheiro parado" valor={brl(parado)} icon={Package} cor="bg-vermelho-bg text-vermelho" sub="sem saída há mais de 90 dias" />
      </div>
      {dados.parados.length > 0 && (
        <Cartao titulo="Peças paradas (mais de 90 dias sem sair)">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="border-b border-linha">
                  <th className={thCls}>Peça</th>
                  <th className={`${thCls} text-right`}>Em estoque</th>
                  <th className={`${thCls} text-right`}>Valor parado</th>
                  <th className={thCls}>Última saída</th>
                </tr>
              </thead>
              <tbody>
                {dados.parados.slice(0, 15).map((p) => (
                  <tr key={p.id} className="border-b border-fundo last:border-0">
                    <td className={`${tdCls} font-semibold`}>{p.nome}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{formatarQtd(p.estoqueAtual, p.unidade)}</td>
                    <td className={`${tdCls} text-right tabular-nums font-bold`}>{brl(p.valorParado)}</td>
                    <td className={`${tdCls} text-grafite/60`}>{p.ultimaSaida ? dataBR(p.ultimaSaida) : 'nunca saiu'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cartao>
      )}
    </div>
  );
}
