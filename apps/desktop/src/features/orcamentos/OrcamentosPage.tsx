import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Zap, ClipboardList } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { brl, type OrcamentoDTO, type OrcamentoResumoDTO, type StatusOrcamento } from '@hermes/shared';
import { http } from '../../api/http';
import { useListaPaginada, useParametroDeTela } from '../../api/lista';
import { CORES_STATUS_ORCAMENTO, LABEL_STATUS_ORCAMENTO, dataBR, relativo } from '../../lib/format';
import { Badge, BtnPrimary, CampoBusca, EstadoTabela, PageHeader, Paginacao, Painel, Placa, linhaCls, tdCls, thCls } from '../../components/ui';
import { DetalheOrcamento, aprovavel, chaveOrcamento } from './DetalheOrcamento';
import { FormOrcamento } from './FormOrcamento';
import { AprovarOrcamento } from './AprovarOrcamento';

const ABAS: { status?: StatusOrcamento; rotulo: string }[] = [
  { rotulo: 'Todos' },
  { status: 'RASCUNHO', rotulo: 'Rascunhos' },
  { status: 'ENVIADO', rotulo: 'Enviados' },
  { status: 'APROVADO', rotulo: 'Aprovados' },
  { status: 'RECUSADO', rotulo: 'Recusados' },
  { status: 'EXPIRADO', rotulo: 'Vencidos' },
];

export default function OrcamentosPage() {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const [status, setStatus] = useState<StatusOrcamento | undefined>(undefined);
  const lista = useListaPaginada<OrcamentoResumoDTO>('orcamentos', '/orcamentos', { status });
  const itens = lista.dados?.itens ?? [];

  const [aberto, setAberto] = useState<string | null>(null);
  const [novo, setNovo] = useState<{ carro?: string } | null>(null);
  const [aprovando, setAprovando] = useState<OrcamentoDTO | null>(null);

  // /orcamentos?novo=1&carro=<id> (busca por placa) e /orcamentos?abrir=<id>.
  const [novoParam, limparNovo, params] = useParametroDeTela('novo');
  const [abrirParam, limparAbrir] = useParametroDeTela('abrir');
  useEffect(() => {
    if (novoParam) {
      setNovo({ carro: params.get('carro') ?? undefined });
      limparNovo();
    }
  }, [novoParam, limparNovo, params]);
  useEffect(() => {
    if (abrirParam) {
      setAberto(abrirParam);
      limparAbrir();
    }
  }, [abrirParam, limparAbrir]);

  /** "Aprovar → OS" direto da lista: busca o orçamento completo e abre a aprovação. */
  async function aprovarDaLista(id: string) {
    const o = await qc.fetchQuery({ queryKey: chaveOrcamento(id), queryFn: () => http.get<OrcamentoDTO>(`/orcamentos/${id}`) });
    setAprovando(o);
  }

  return (
    <div>
      <PageHeader title="Orçamentos" subtitle={`${lista.dados?.total ?? 0} orçamento(s)`}>
        <CampoBusca valor={lista.busca} onBuscar={lista.setBusca} placeholder="Nº, cliente, placa ou telefone..." autoFocus />
        <BtnPrimary icone={Plus} onClick={() => setNovo({})}>
          Novo orçamento
        </BtnPrimary>
      </PageHeader>

      <div className="flex items-center gap-1 bg-white border border-linha rounded-xl p-1 overflow-x-auto mb-4 w-fit max-w-full" role="tablist">
        {ABAS.map((a) => (
          <button
            key={a.rotulo}
            role="tab"
            aria-selected={status === a.status}
            onClick={() => setStatus(a.status)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition whitespace-nowrap ${
              status === a.status ? 'bg-petroleo text-white shadow-sm' : 'text-grafite/60 hover:bg-fundo'
            }`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Nº</th>
              <th className={thCls}>Cliente</th>
              <th className={thCls}>Veículo</th>
              <th className={thCls}>Data</th>
              <th className={thCls}>Validade</th>
              <th className={thCls}>Situação</th>
              <th className={`${thCls} text-right`}>Total</th>
              <th className={`${thCls} text-right`}>Ação</th>
            </tr>
          </thead>
          <tbody>
            <EstadoTabela
              carregando={lista.consulta.isPending}
              erro={lista.consulta.error}
              vazio={itens.length === 0}
              colSpan={8}
              textoVazio={lista.busca ? 'Nenhum orçamento encontrado.' : 'Nenhum orçamento ainda. Que tal o primeiro?'}
              onTentar={() => void lista.consulta.refetch()}
            />
            {itens.map((o) => (
              <tr key={o.id} onClick={() => setAberto(o.id)} className={`${linhaCls} cursor-pointer`}>
                <td className={`${tdCls} font-mono font-bold text-grafite/50`}>#{o.numero}</td>
                <td className={tdCls}>
                  {o.cliente ? (
                    <span className="font-bold">{o.cliente.nome}</span>
                  ) : (
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold">{o.contatoNome || 'Sem nome'}</span>
                      <Badge cor="bg-azul-bg text-azul">
                        <Zap size={11} /> Rápido
                      </Badge>
                    </span>
                  )}
                </td>
                <td className={tdCls}>
                  {o.carro ? (
                    <span className="flex items-center gap-1.5">
                      <Placa placa={o.carro.placa} />
                      <span className="text-grafite/60 text-xs truncate">{o.carro.modelo}</span>
                    </span>
                  ) : (
                    <span className="text-grafite/50 text-sm">{o.veiculoDescricao ?? '—'}</span>
                  )}
                </td>
                <td className={`${tdCls} text-grafite/60 whitespace-nowrap`}>{dataBR(o.data)}</td>
                <td className={`${tdCls} whitespace-nowrap text-grafite/60`}>{aprovavel(o) ? relativo(o.validade) : dataBR(o.validade)}</td>
                <td className={tdCls}>
                  <Badge cor={CORES_STATUS_ORCAMENTO[o.status]}>{LABEL_STATUS_ORCAMENTO[o.status]}</Badge>
                </td>
                <td className={`${tdCls} text-right font-extrabold tabular-nums`}>{brl(o.total)}</td>
                <td className={`${tdCls} text-right whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
                  {aprovavel(o) ? (
                    <button
                      type="button"
                      onClick={() => void aprovarDaLista(o.id)}
                      className="bg-verde/10 text-verde font-bold px-3 py-1.5 rounded-lg hover:bg-verde/20 transition inline-flex items-center gap-1 text-sm"
                    >
                      <Zap size={14} /> Aprovar → OS
                    </button>
                  ) : o.os ? (
                    <button
                      type="button"
                      onClick={() => navegar(`/ordens?abrir=${o.os!.id}`)}
                      className="text-sm font-bold text-petroleo hover:underline inline-flex items-center gap-1"
                    >
                      <ClipboardList size={14} /> OS #{o.os.numero}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Paginacao pagina={lista.pagina} porPagina={lista.porPagina} total={lista.dados?.total ?? 0} onPagina={lista.setPagina} />
      </Painel>

      {aberto && <DetalheOrcamento key={aberto} id={aberto} onFechar={() => setAberto(null)} onAbrir={setAberto} />}
      {novo && (
        <FormOrcamento
          carroInicial={novo.carro}
          onFechar={() => setNovo(null)}
          onSalvo={(o) => {
            setNovo(null);
            setAberto(o.id);
          }}
        />
      )}
      {aprovando && (
        <AprovarOrcamento
          orc={aprovando}
          onFechar={() => setAprovando(null)}
          onAprovado={(r) => {
            setAprovando(null);
            navegar(`/ordens?abrir=${r.os.id}`);
          }}
        />
      )}
    </div>
  );
}
