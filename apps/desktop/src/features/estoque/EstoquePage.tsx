import { useEffect, useState } from 'react';
import { ArrowDownToLine, ClipboardCheck, History, Plus, ScanBarcode } from 'lucide-react';
import { brl, formatarQtd, type PecaDTO } from '@hermes/shared';
import { ApiError, http, mensagemDeErro } from '../../api/http';
import { useAcao } from '../../api/acoes';
import { buscarTodas, useListaPaginada, useParametroDeTela } from '../../api/lista';
import { useAvisos } from '../../lib/avisos';
import { baixarCSV } from '../../lib/csv';
import { useSessao } from '../acesso/sessao';
import {
  AcaoEditar,
  AcaoExcluir,
  BtnGhost,
  BtnIcone,
  BtnPrimary,
  CampoBusca,
  EstadoTabela,
  Marcador,
  PageHeader,
  Paginacao,
  Painel,
  linhaCls,
  tdCls,
  thCls,
} from '../../components/ui';
import { FormPeca } from './FormPeca';
import { AjustePeca, EntradaPeca, KardexPeca } from './Movimentos';

type Janela = { tipo: 'form'; peca: PecaDTO | null; codigo?: string } | { tipo: 'entrada' | 'ajuste' | 'kardex'; peca: PecaDTO } | null;

export default function EstoquePage() {
  const { pode } = useSessao();
  const avisos = useAvisos();
  const [baixo, setBaixo] = useState(false);
  const lista = useListaPaginada<PecaDTO>('pecas', '/pecas', { baixo: baixo || undefined });
  const itens = lista.dados?.itens ?? [];
  const [janela, setJanela] = useState<Janela>(null);
  const verCusto = pode('verCusto');

  // /estoque?baixo=1 (vindo do alerta do painel).
  const [baixoParam, limparBaixo] = useParametroDeTela('baixo');
  useEffect(() => {
    if (baixoParam) {
      setBaixo(true);
      limparBaixo();
    }
  }, [baixoParam, limparBaixo]);

  const excluir = useAcao((p: PecaDTO) => http.delete(`/pecas/${p.id}`), {
    invalidar: [['pecas'], ['alertas']],
    sucesso: 'Peça retirada do catálogo. O histórico continua guardado.',
  });

  async function exportar() {
    const todas = await buscarTodas<PecaDTO>('/pecas', { baixo: baixo || undefined, busca: lista.busca });
    baixarCSV(
      `estoque-${new Date().toISOString().slice(0, 10)}`,
      [
        { titulo: 'Peça', valor: (p) => p.nome },
        { titulo: 'Código de barras', valor: (p) => p.codigoBarras },
        { titulo: 'SKU', valor: (p) => p.sku },
        { titulo: 'Local', valor: (p) => p.localizacao },
        { titulo: 'Estoque', valor: (p) => p.estoqueAtual },
        { titulo: 'Unidade', valor: (p) => p.unidade },
        { titulo: 'Mínimo', valor: (p) => p.estoqueMinimo },
        { titulo: 'Preço de venda', valor: (p) => p.precoVenda },
        ...(verCusto ? [{ titulo: 'Custo médio', valor: (p: PecaDTO) => p.precoCusto }] : []),
      ],
      todas,
    );
  }

  return (
    <div>
      <PageHeader title="Estoque" subtitle={`${lista.dados?.total ?? 0} item(ns)${baixo ? ' com estoque baixo' : ''}`}>
        <CampoBusca valor={lista.busca} onBuscar={lista.setBusca} placeholder="Nome, código ou prateleira..." autoFocus />
        {pode('alterarPrecoCusto') && (
          <BtnPrimary icone={Plus} onClick={() => setJanela({ tipo: 'form', peca: null })}>
            Nova peça
          </BtnPrimary>
        )}
      </PageHeader>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {pode('movimentarEstoque') && (
          <LeitorEntrada
            onAchou={(p) => setJanela({ tipo: 'entrada', peca: p })}
            onNaoAchou={(codigo) => {
              if (pode('alterarPrecoCusto')) setJanela({ tipo: 'form', peca: null, codigo });
              else avisos.erro(`Nenhuma peça com o código ${codigo}. Peça ao Dono para cadastrá-la.`);
            }}
          />
        )}
        <div className="w-60">
          <Marcador checked={baixo} onChange={setBaixo}>
            Só o que precisa repor
          </Marcador>
        </div>
        <div className="flex-1" />
        <BtnGhost onClick={() => void exportar()} className="text-sm">
          Exportar planilha
        </BtnGhost>
      </div>

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Peça</th>
              <th className={thCls}>Local</th>
              <th className={`${thCls} text-right`}>Estoque</th>
              <th className={`${thCls} text-right`}>Venda</th>
              {verCusto && <th className={`${thCls} text-right`}>Custo</th>}
              {verCusto && <th className={`${thCls} text-right`}>Margem</th>}
              <th className={`${thCls} text-right`}>Ações</th>
            </tr>
          </thead>
          <tbody>
            <EstadoTabela
              carregando={lista.consulta.isPending}
              erro={lista.consulta.error}
              vazio={itens.length === 0}
              colSpan={verCusto ? 7 : 5}
              textoVazio={baixo ? 'Nada abaixo do mínimo. Estoque em dia!' : 'Nenhuma peça encontrada.'}
              onTentar={() => void lista.consulta.refetch()}
            />
            {itens.map((p) => (
              <tr key={p.id} className={linhaCls}>
                <td className={tdCls}>
                  <div className="font-bold">{p.nome}</div>
                  <div className="text-xs text-grafite/45 font-mono">{[p.codigoBarras, p.sku].filter(Boolean).join(' · ') || '—'}</div>
                </td>
                <td className={`${tdCls} text-grafite/60`}>{p.localizacao ?? '—'}</td>
                <td className={`${tdCls} text-right whitespace-nowrap`}>
                  <span className={`font-extrabold tabular-nums ${p.estoqueAtual <= 0 ? 'text-vermelho' : p.estoqueBaixo ? 'text-amarelo' : ''}`}>
                    {formatarQtd(p.estoqueAtual, p.unidade)}
                  </span>
                  <div className="text-[11px] text-grafite/40">mín. {formatarQtd(p.estoqueMinimo)}</div>
                </td>
                <td className={`${tdCls} text-right tabular-nums font-semibold`}>{brl(p.precoVenda)}</td>
                {verCusto && <td className={`${tdCls} text-right tabular-nums text-grafite/60`}>{p.precoCusto != null ? brl(p.precoCusto) : '—'}</td>}
                {verCusto && (
                  <td className={`${tdCls} text-right tabular-nums ${p.margemPct != null && p.margemPct < 0 ? 'text-vermelho font-bold' : 'text-grafite/60'}`}>
                    {p.margemPct != null ? `${p.margemPct.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%` : '—'}
                  </td>
                )}
                <td className={`${tdCls} text-right whitespace-nowrap`}>
                  {pode('movimentarEstoque') && <BtnIcone icone={ArrowDownToLine} titulo="Dar entrada" onClick={() => setJanela({ tipo: 'entrada', peca: p })} />}
                  {pode('ajustarEstoque') && <BtnIcone icone={ClipboardCheck} titulo="Inventário (acertar contagem)" onClick={() => setJanela({ tipo: 'ajuste', peca: p })} />}
                  <BtnIcone icone={History} titulo="Movimentação (kardex)" onClick={() => setJanela({ tipo: 'kardex', peca: p })} />
                  {pode('alterarPrecoCusto') && <AcaoEditar onClick={() => setJanela({ tipo: 'form', peca: p })} />}
                  {pode('apagarRegistros') && (
                    <AcaoExcluir
                      onClick={async () => {
                        const ok = await avisos.confirmar({
                          titulo: `Tirar ${p.nome} do catálogo?`,
                          mensagem: 'Ela some das buscas. As OS, vendas e a movimentação antigas continuam guardadas.',
                          botao: 'Tirar do catálogo',
                          perigo: true,
                        });
                        if (ok) excluir.mutate(p);
                      }}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Paginacao pagina={lista.pagina} porPagina={lista.porPagina} total={lista.dados?.total ?? 0} onPagina={lista.setPagina} />
      </Painel>

      {janela?.tipo === 'form' && <FormPeca peca={janela.peca} codigoInicial={janela.codigo} onFechar={() => setJanela(null)} />}
      {janela?.tipo === 'entrada' && <EntradaPeca peca={janela.peca} onFechar={() => setJanela(null)} />}
      {janela?.tipo === 'ajuste' && <AjustePeca peca={janela.peca} onFechar={() => setJanela(null)} />}
      {janela?.tipo === 'kardex' && <KardexPeca peca={janela.peca} onFechar={() => setJanela(null)} />}
    </div>
  );
}

/**
 * Entrada pelo leitor: o leitor de código de barras "digita" o código e
 * aperta Enter. Achou a peça, abre a entrada; não achou, oferece cadastrar.
 */
function LeitorEntrada({ onAchou, onNaoAchou }: { onAchou: (p: PecaDTO) => void; onNaoAchou: (codigo: string) => void }) {
  const [codigo, setCodigo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const avisos = useAvisos();

  async function buscar() {
    const c = codigo.trim();
    if (!c) return;
    setBuscando(true);
    try {
      onAchou(await http.get<PecaDTO>(`/pecas/codigo/${encodeURIComponent(c)}`));
      setCodigo('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        onNaoAchou(c);
        setCodigo('');
      } else avisos.erro(mensagemDeErro(e));
    } finally {
      setBuscando(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void buscar();
      }}
      className="flex items-center gap-2 bg-white border border-linha rounded-xl px-3 py-2 w-full sm:w-80 focus-within:border-laranja"
    >
      <ScanBarcode size={18} className="text-grafite/40 shrink-0" />
      <input
        value={codigo}
        disabled={buscando}
        onChange={(e) => setCodigo(e.target.value)}
        placeholder="Entrada rápida: bipe o código de barras"
        aria-label="Código de barras para entrada rápida"
        className="flex-1 min-w-0 outline-none text-sm bg-transparent font-mono"
      />
    </form>
  );
}
