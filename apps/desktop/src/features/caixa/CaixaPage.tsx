import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, ChevronLeft, ChevronRight, Download, Plus, Scale, Wallet } from 'lucide-react';
import {
  LABEL_FORMA_PAGAMENTO,
  LABEL_ORIGEM_LANCAMENTO,
  ORIGENS_LANCAMENTO,
  brl,
  type FormaPagamento,
  type LancamentoDTO,
  type ListaCaixaDTO,
  type OrigemLancamento,
  type ResumoDiaDTO,
  type TipoLancamento,
} from '@hermes/shared';
import { http } from '../../api/http';
import { buscarTodas, useListaPaginada } from '../../api/lista';
import { baixarCSV, type ColunaCSV } from '../../lib/csv';
import { CORES_ORIGEM, dataBR, dataHoraBR, diaLongoBR, hojeISO, horaBR, paraData, paraDataISO } from '../../lib/format';
import { rangeDe, type PeriodoKey } from '../../lib/periodo';
import { Badge, BtnGhost, BtnPrimary, ErroAoCarregar, EstadoTabela, Kpi, PageHeader, Paginacao, Painel, Periodo, Selecao, linhaCls, tdCls, thCls } from '../../components/ui';
import { NovoLancamento } from './NovoLancamento';

type Aba = 'dia' | 'lancamentos';

const COLUNAS_CSV: ColunaCSV<LancamentoDTO>[] = [
  { titulo: 'Data', valor: (l) => dataHoraBR(l.data) },
  { titulo: 'Tipo', valor: (l) => (l.tipo === 'ENTRADA' ? 'Entrada' : 'Saída') },
  { titulo: 'Origem', valor: (l) => LABEL_ORIGEM_LANCAMENTO[l.origem] },
  { titulo: 'Descrição', valor: (l) => l.descricao },
  { titulo: 'Categoria', valor: (l) => l.categoria },
  { titulo: 'Forma', valor: (l) => (l.formaPagamento ? LABEL_FORMA_PAGAMENTO[l.formaPagamento] : '') },
  { titulo: 'Valor', valor: (l) => (l.tipo === 'SAIDA' ? -l.valor : l.valor) },
  { titulo: 'Usuário', valor: (l) => l.usuario },
];

export default function CaixaPage() {
  const [aba, setAba] = useState<Aba>('dia');
  const [novo, setNovo] = useState(false);

  return (
    <div>
      <PageHeader title="Livro-caixa" subtitle="Todo dinheiro que entra e sai da oficina">
        <BtnPrimary icone={Plus} onClick={() => setNovo(true)}>
          Lançamento manual
        </BtnPrimary>
      </PageHeader>
      <div className="flex items-center gap-1 bg-white border border-linha rounded-xl p-1 mb-4 w-fit" role="tablist">
        {(
          [
            ['dia', 'Fechamento do dia'],
            ['lancamentos', 'Lançamentos'],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            key={id}
            role="tab"
            aria-selected={aba === id}
            onClick={() => setAba(id)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition ${aba === id ? 'bg-petroleo text-white shadow-sm' : 'text-grafite/60 hover:bg-fundo'}`}
          >
            {rotulo}
          </button>
        ))}
      </div>
      {aba === 'dia' ? <FechamentoDoDia /> : <Lancamentos />}
      {novo && <NovoLancamento onFechar={() => setNovo(false)} />}
    </div>
  );
}

const outroDia = (iso: string, n: number) => {
  const d = paraData(iso);
  d.setDate(d.getDate() + n);
  return paraDataISO(d);
};

/** RN-15: o que conferir na gaveta, no PIX e na maquininha no fim do dia. */
function FechamentoDoDia() {
  const [dia, setDia] = useState(hojeISO());
  const consulta = useQuery({ queryKey: ['caixa', 'resumo', dia], queryFn: () => http.get<ResumoDiaDTO>('/caixa/resumo', { data: dia }) });
  const r = consulta.data;
  const hoje = hojeISO();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <BtnGhost onClick={() => setDia((d) => outroDia(d, -1))} titulo="Dia anterior" className="!px-3">
          <ChevronLeft size={16} />
        </BtnGhost>
        <input type="date" value={dia} max={hoje} onChange={(e) => e.target.value && setDia(e.target.value)} className="border border-linha rounded-xl px-3 py-2 bg-white font-semibold" />
        <BtnGhost onClick={() => setDia((d) => outroDia(d, 1))} disabled={dia >= hoje} titulo="Próximo dia" className="!px-3">
          <ChevronRight size={16} />
        </BtnGhost>
        <span className="text-sm text-grafite/55 ml-1">{diaLongoBR(dia)}</span>
        <div className="flex-1" />
        {r && r.lancamentos.length > 0 && (
          <BtnGhost icone={Download} onClick={() => baixarCSV(`caixa-${dia}`, COLUNAS_CSV, r.lancamentos)} className="text-sm">
            Planilha do dia
          </BtnGhost>
        )}
      </div>

      {consulta.error ? (
        <ErroAoCarregar erro={consulta.error} onTentar={() => void consulta.refetch()} />
      ) : !r ? (
        <div className="text-center text-grafite/40 py-10 text-sm">Carregando...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Saldo do dia anterior" valor={brl(r.saldoAnterior)} icon={Scale} cor="bg-fundo text-grafite/50" />
            <Kpi label="Entradas" valor={brl(r.entradas)} icon={ArrowDownCircle} cor="bg-verde-bg text-verde" />
            <Kpi label="Saídas" valor={brl(r.saidas)} icon={ArrowUpCircle} cor="bg-vermelho-bg text-vermelho" />
            <Kpi label="Saldo final" valor={brl(r.saldoFinal)} icon={Wallet} cor="bg-laranja/10 text-laranja" />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <PorForma titulo="Entradas por forma — confira" valores={r.entradasPorForma} cor="text-verde" dica="Dinheiro: conte a gaveta. PIX: confira o extrato. Cartão: bata com a maquininha." />
            <PorForma titulo="Saídas por forma" valores={r.saidasPorForma} cor="text-vermelho" />
          </div>

          <Painel>
            <table className="w-full">
              <thead>
                <tr className="border-b border-linha">
                  <th className={thCls}>Hora</th>
                  <th className={thCls}>Descrição</th>
                  <th className={thCls}>Origem</th>
                  <th className={thCls}>Forma</th>
                  <th className={`${thCls} text-right`}>Valor</th>
                </tr>
              </thead>
              <tbody>
                <EstadoTabela carregando={false} vazio={r.lancamentos.length === 0} colSpan={5} textoVazio="Nenhum movimento neste dia." />
                {r.lancamentos.map((l) => (
                  <LinhaLancamento key={l.id} l={l} hora />
                ))}
              </tbody>
            </table>
          </Painel>
        </>
      )}
    </div>
  );
}

function PorForma({ titulo, valores, cor, dica }: { titulo: string; valores: ResumoDiaDTO['entradasPorForma']; cor: string; dica?: string }) {
  const linhas = Object.entries(valores).filter(([, v]) => (v ?? 0) !== 0) as [FormaPagamento | 'OUTRA', number][];
  return (
    <section className="bg-white rounded-2xl border border-linha shadow-sm p-4">
      <h2 className="text-sm font-extrabold text-petroleo">{titulo}</h2>
      {dica && <p className="text-xs text-grafite/50 mt-0.5">{dica}</p>}
      <div className="mt-3 space-y-1.5">
        {linhas.length === 0 && <div className="text-sm text-grafite/40">Nada.</div>}
        {linhas.map(([forma, valor]) => (
          <div key={forma} className="flex items-center justify-between text-sm">
            <span className="font-semibold">{forma === 'OUTRA' ? 'Sem forma informada' : LABEL_FORMA_PAGAMENTO[forma]}</span>
            <span className={`font-extrabold tabular-nums ${cor}`}>{brl(valor)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function LinhaLancamento({ l, hora }: { l: LancamentoDTO; hora?: boolean }) {
  return (
    <tr className={linhaCls}>
      <td className={`${tdCls} whitespace-nowrap text-grafite/60 tabular-nums`}>{hora ? horaBR(l.data) : dataBR(l.data)}</td>
      <td className={tdCls}>
        <div className="font-semibold">{l.descricao}</div>
        <div className="text-xs text-grafite/45">
          {[l.categoria, l.usuario].filter(Boolean).join(' · ')}
          {l.os && (
            <Link to={`/ordens?abrir=${l.os.id}`} className="font-bold hover:underline ml-1">
              OS #{l.os.numero}
            </Link>
          )}
        </div>
      </td>
      <td className={tdCls}>
        <Badge cor={CORES_ORIGEM[l.origem]}>{LABEL_ORIGEM_LANCAMENTO[l.origem]}</Badge>
      </td>
      <td className={`${tdCls} text-grafite/60`}>{l.formaPagamento ? LABEL_FORMA_PAGAMENTO[l.formaPagamento] : '—'}</td>
      <td className={`${tdCls} text-right font-extrabold tabular-nums whitespace-nowrap ${l.tipo === 'ENTRADA' ? 'text-verde' : 'text-vermelho'}`}>
        {l.tipo === 'ENTRADA' ? '+' : '−'}
        {brl(l.valor)}
      </td>
    </tr>
  );
}

function Lancamentos() {
  const [periodo, setPeriodo] = useState<PeriodoKey>('mes');
  const [tipo, setTipo] = useState<TipoLancamento | ''>('');
  const [origem, setOrigem] = useState<OrigemLancamento | ''>('');
  const filtros = { ...rangeDe(periodo), tipo: tipo || undefined, origem: origem || undefined };
  const lista = useListaPaginada<LancamentoDTO, Pick<ListaCaixaDTO, 'totais'>>('caixa', '/caixa', filtros, 50);
  const itens = lista.dados?.itens ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Periodo value={periodo} onChange={setPeriodo} />
        <Selecao value={tipo} onChange={(e) => setTipo(e.target.value as TipoLancamento | '')} className="!w-auto !py-2 text-sm" aria-label="Tipo">
          <option value="">Entradas e saídas</option>
          <option value="ENTRADA">Só entradas</option>
          <option value="SAIDA">Só saídas</option>
        </Selecao>
        <Selecao value={origem} onChange={(e) => setOrigem(e.target.value as OrigemLancamento | '')} className="!w-auto !py-2 text-sm" aria-label="Origem">
          <option value="">Todas as origens</option>
          {ORIGENS_LANCAMENTO.map((o) => (
            <option key={o} value={o}>
              {LABEL_ORIGEM_LANCAMENTO[o]}
            </option>
          ))}
        </Selecao>
        <div className="flex-1" />
        <BtnGhost icone={Download} className="text-sm" onClick={() => void buscarTodas<LancamentoDTO>('/caixa', filtros).then((t) => baixarCSV(`caixa-${periodo}`, COLUNAS_CSV, t))}>
          Exportar planilha
        </BtnGhost>
      </div>

      {lista.dados && (
        <div className="grid sm:grid-cols-3 gap-3">
          <Kpi label="Entradas" valor={brl(lista.dados.totais.entradas)} icon={ArrowDownCircle} cor="bg-verde-bg text-verde" />
          <Kpi label="Saídas" valor={brl(lista.dados.totais.saidas)} icon={ArrowUpCircle} cor="bg-vermelho-bg text-vermelho" />
          <Kpi label="Resultado do período" valor={brl(lista.dados.totais.saldo)} icon={Scale} cor="bg-laranja/10 text-laranja" />
        </div>
      )}

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Data</th>
              <th className={thCls}>Descrição</th>
              <th className={thCls}>Origem</th>
              <th className={thCls}>Forma</th>
              <th className={`${thCls} text-right`}>Valor</th>
            </tr>
          </thead>
          <tbody>
            <EstadoTabela
              carregando={lista.consulta.isPending}
              erro={lista.consulta.error}
              vazio={itens.length === 0}
              colSpan={5}
              textoVazio="Nenhum lançamento neste período."
              onTentar={() => void lista.consulta.refetch()}
            />
            {itens.map((l) => (
              <LinhaLancamento key={l.id} l={l} />
            ))}
          </tbody>
        </table>
        <Paginacao pagina={lista.pagina} porPagina={lista.porPagina} total={lista.dados?.total ?? 0} onPagina={lista.setPagina} />
      </Painel>
    </div>
  );
}
