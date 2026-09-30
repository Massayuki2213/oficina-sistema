import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Plus, Receipt, Trash2, Wallet } from 'lucide-react';
import { LABEL_FORMA_PAGAMENTO, brl, formatarQtd, type CompraDTO, type CompraResumoDTO, type FornecedorDTO, type ListaComprasDTO, type StatusCompra } from '@hermes/shared';
import { http, mensagemDeErro } from '../../api/http';
import { useListaPaginada } from '../../api/lista';
import { useAvisos } from '../../lib/avisos';
import { CORES_STATUS_COMPRA, LABEL_STATUS_COMPRA, dataBR } from '../../lib/format';
import { rangeDe, type PeriodoKey } from '../../lib/periodo';
import { useSessao } from '../acesso/sessao';
import {
  Badge,
  BtnGhost,
  BtnPrimary,
  ErroAoCarregar,
  EstadoTabela,
  InfoLinha,
  Kpi,
  Modal,
  PageHeader,
  Paginacao,
  Painel,
  Periodo,
  Selecao,
  linhaCls,
  tdCls,
  thCls,
} from '../../components/ui';
import { PagarConta } from '../../components/PagarConta';
import { NovaCompra } from './NovaCompra';

const INVALIDAR = [['compras'], ['fornecedores'], ['caixa'], ['alertas'], ['relatorios'], ['pecas']];

export default function ComprasPage() {
  const { pode } = useSessao();
  const [periodo, setPeriodo] = useState<PeriodoKey>('mes');
  const [status, setStatus] = useState<StatusCompra | ''>('');
  const [fornecedorId, setFornecedorId] = useState('');
  const fornecedores = useQuery({ queryKey: ['fornecedores'], queryFn: () => http.get<FornecedorDTO[]>('/fornecedores') });
  const lista = useListaPaginada<CompraResumoDTO, Pick<ListaComprasDTO, 'totais'>>('compras', '/compras', {
    ...rangeDe(periodo),
    status: status || undefined,
    fornecedorId: fornecedorId || undefined,
  });
  const itens = lista.dados?.itens ?? [];
  const [nova, setNova] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);

  return (
    <div>
      <PageHeader title="Compras" subtitle="Notas dos distribuidores: entram no estoque e viram conta a pagar">
        {pode('alterarPrecoCusto') && (
          <BtnPrimary icone={Plus} onClick={() => setNova(true)}>
            Nova compra
          </BtnPrimary>
        )}
      </PageHeader>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Periodo value={periodo} onChange={setPeriodo} />
        <Selecao value={status} onChange={(e) => setStatus(e.target.value as StatusCompra | '')} className="!w-auto !py-2 text-sm" aria-label="Situação">
          <option value="">Todas</option>
          <option value="PENDENTE">A pagar</option>
          <option value="PAGA">Pagas</option>
        </Selecao>
        <Selecao value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className="!w-auto !py-2 text-sm" aria-label="Distribuidor">
          <option value="">Todos os distribuidores</option>
          {(fornecedores.data ?? []).map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </Selecao>
      </div>

      {lista.dados && (
        <div className="grid sm:grid-cols-3 gap-3 mb-5">
          <Kpi label="Comprado no período" valor={brl(lista.dados.totais.total)} icon={Receipt} cor="bg-azul-bg text-azul" />
          <Kpi label="A pagar" valor={brl(lista.dados.totais.aPagar)} icon={Wallet} cor="bg-amarelo-bg text-amarelo" />
          <Kpi label="Pago" valor={brl(lista.dados.totais.pago)} icon={CheckCircle2} cor="bg-verde-bg text-verde" />
        </div>
      )}

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Nº</th>
              <th className={thCls}>Data</th>
              <th className={thCls}>Distribuidor</th>
              <th className={thCls}>Nota</th>
              <th className={thCls}>Vencimento</th>
              <th className={thCls}>Situação</th>
              <th className={`${thCls} text-right`}>Total</th>
            </tr>
          </thead>
          <tbody>
            <EstadoTabela
              carregando={lista.consulta.isPending}
              erro={lista.consulta.error}
              vazio={itens.length === 0}
              colSpan={7}
              textoVazio="Nenhuma compra neste período."
              onTentar={() => void lista.consulta.refetch()}
            />
            {itens.map((c) => (
              <tr key={c.id} onClick={() => setAberta(c.id)} className={`${linhaCls} cursor-pointer`}>
                <td className={`${tdCls} font-mono font-bold text-grafite/50`}>#{c.numero}</td>
                <td className={`${tdCls} text-grafite/60`}>{dataBR(c.data)}</td>
                <td className={`${tdCls} font-bold`}>
                  {c.fornecedor.nome}
                  <span className="font-normal text-xs text-grafite/45"> · {c.qtdItens} item(ns)</span>
                </td>
                <td className={`${tdCls} text-grafite/60`}>{c.numeroNota ?? '—'}</td>
                <td className={`${tdCls} whitespace-nowrap ${c.vencida ? 'text-vermelho font-bold' : 'text-grafite/60'}`}>
                  {c.vencimento ? dataBR(c.vencimento) : '—'}
                  {c.vencida && <AlertTriangle size={13} className="inline ml-1 -mt-0.5" />}
                </td>
                <td className={tdCls}>
                  <Badge cor={CORES_STATUS_COMPRA[c.status]}>{LABEL_STATUS_COMPRA[c.status]}</Badge>
                </td>
                <td className={`${tdCls} text-right font-extrabold tabular-nums`}>{brl(c.valorTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Paginacao pagina={lista.pagina} porPagina={lista.porPagina} total={lista.dados?.total ?? 0} onPagina={lista.setPagina} />
      </Painel>

      {nova && (
        <NovaCompra
          onFechar={() => setNova(false)}
          onCriada={(c) => {
            setNova(false);
            setAberta(c.id);
          }}
        />
      )}
      {aberta && <DetalheCompra id={aberta} onFechar={() => setAberta(null)} />}
    </div>
  );
}

function DetalheCompra({ id, onFechar }: { id: string; onFechar: () => void }) {
  const { pode } = useSessao();
  const qc = useQueryClient();
  const avisos = useAvisos();
  const consulta = useQuery({ queryKey: ['compras', id], queryFn: () => http.get<CompraDTO>(`/compras/${id}`) });
  const [pagando, setPagando] = useState(false);
  const c = consulta.data;

  async function excluir() {
    if (!c) return;
    const ok = await avisos.confirmar({
      titulo: `Apagar a compra #${c.numero}?`,
      mensagem: 'As peças desta compra saem do estoque de novo e a conta a pagar some. Use só para compra lançada errada.',
      botao: 'Apagar compra',
      perigo: true,
    });
    if (!ok) return;
    try {
      await http.delete(`/compras/${c.id}`);
      onFechar();
      qc.removeQueries({ queryKey: ['compras', c.id] });
      await Promise.all(INVALIDAR.map((queryKey) => qc.invalidateQueries({ queryKey })));
      avisos.sucesso('Compra apagada e estoque estornado.');
    } catch (e) {
      avisos.erro(mensagemDeErro(e));
    }
  }

  return (
    <>
      <Modal
        title={c ? `Compra #${c.numero}` : 'Compra'}
        size="lg"
        onClose={onFechar}
        semConfirmarDescarte
        semFocoInicial
        footer={
          <>
            {c && c.status === 'PENDENTE' && pode('apagarRegistros') && (
              <BtnGhost icone={Trash2} onClick={() => void excluir()} className="mr-auto !text-vermelho">
                Apagar
              </BtnGhost>
            )}
            <BtnGhost onClick={onFechar}>Fechar</BtnGhost>
            {c && c.status === 'PENDENTE' && pode('verFinanceiro') && (
              <BtnPrimary icone={Wallet} onClick={() => setPagando(true)}>
                Pagar
              </BtnPrimary>
            )}
          </>
        }
      >
        {!c ? (
          consulta.error ? (
            <ErroAoCarregar erro={consulta.error} onTentar={() => void consulta.refetch()} />
          ) : (
            <div className="text-center text-grafite/40 py-10 text-sm">Carregando...</div>
          )
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-fundo rounded-xl p-3 text-sm">
              <InfoLinha rotulo="Distribuidor" valor={c.fornecedor.nome} />
              <InfoLinha rotulo="Data" valor={dataBR(c.data)} />
              <InfoLinha rotulo="Nota" valor={c.numeroNota} />
              <InfoLinha
                rotulo={c.status === 'PAGA' ? 'Paga em' : 'Vence'}
                valor={
                  c.status === 'PAGA'
                    ? `${c.pagoEm ? dataBR(c.pagoEm) : '—'}${c.formaPagamento ? ` · ${LABEL_FORMA_PAGAMENTO[c.formaPagamento]}` : ''}`
                    : c.vencimento
                      ? dataBR(c.vencimento)
                      : '—'
                }
              />
            </div>
            <div className="border border-linha rounded-xl divide-y divide-linha">
              {c.itens.map((i) => (
                <div key={i.id} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                  <span className="flex-1 min-w-0 truncate font-bold">{i.nome}</span>
                  <span className="text-grafite/60 tabular-nums">
                    {formatarQtd(i.quantidade, i.unidade)} × {brl(i.custoUnit)}
                  </span>
                  <span className="w-24 text-right font-bold tabular-nums">{brl(i.subtotal)}</span>
                </div>
              ))}
            </div>
            <div className="text-right text-2xl font-extrabold text-petroleo tabular-nums">{brl(c.valorTotal)}</div>
            {c.observacoes && <p className="text-sm text-grafite/65 whitespace-pre-wrap">{c.observacoes}</p>}
          </>
        )}
      </Modal>
      {c && pagando && (
        <PagarConta
          titulo={`Pagar a compra #${c.numero}`}
          valor={c.valorTotal}
          formaPadrao="TRANSFERENCIA"
          onFechar={() => setPagando(false)}
          onConfirmar={async (forma) => {
            await http.post(`/compras/${c.id}/pagar`, { formaPagamento: forma });
            await Promise.all(INVALIDAR.map((queryKey) => qc.invalidateQueries({ queryKey })));
            avisos.sucesso(`Compra #${c.numero} paga.`);
          }}
        >
          {c.fornecedor.nome} — o valor sai do caixa hoje.
        </PagarConta>
      )}
    </>
  );
}
