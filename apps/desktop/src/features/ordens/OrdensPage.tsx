import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, ShieldCheck, UserCheck } from 'lucide-react';
import { brl, type OrdemServicoDTO, type OSResumoDTO, type StatusOS } from '@hermes/shared';
import { http } from '../../api/http';
import { useAcao } from '../../api/acoes';
import { useEquipe } from '../../api/catalogo';
import { useListaPaginada, useParametroDeTela } from '../../api/lista';
import { CORES_STATUS_OS, LABEL_STATUS_OS, dataBR, dataHoraBR } from '../../lib/format';
import { useSessao } from '../acesso/sessao';
import { Badge, BtnPrimary, CampoBusca, EstadoTabela, PageHeader, Paginacao, Painel, Placa, Selecao, linhaCls, tdCls, thCls } from '../../components/ui';
import { DetalheOS } from './DetalheOS';
import { NovaOS } from './NovaOS';

/** Coluna que só aparece da largura de tablet para cima. */
const soNoComputador = 'hidden md:table-cell';

type Aba = 'oficina' | 'prontas' | 'entregues' | 'canceladas' | 'todas';

const ABAS: { id: Aba; rotulo: string; filtro: { abertas?: boolean; status?: StatusOS } }[] = [
  { id: 'oficina', rotulo: 'Na oficina', filtro: { abertas: true } },
  { id: 'prontas', rotulo: 'Prontas', filtro: { status: 'CONCLUIDA' } },
  { id: 'entregues', rotulo: 'Entregues', filtro: { status: 'ENTREGUE' } },
  { id: 'canceladas', rotulo: 'Canceladas', filtro: { status: 'CANCELADA' } },
  { id: 'todas', rotulo: 'Todas', filtro: {} },
];

export default function OrdensPage() {
  const { usuario, pode } = useSessao();
  const [aba, setAba] = useState<Aba>('oficina');
  const [mecanicoId, setMecanicoId] = useState('');
  const equipe = useEquipe('MECANICO');
  const filtro = ABAS.find((a) => a.id === aba)!.filtro;
  const lista = useListaPaginada<OSResumoDTO>('ordens', '/ordens', { ...filtro, mecanicoId: mecanicoId || undefined });
  const itens = lista.dados?.itens ?? [];

  const [aberta, setAberta] = useState<string | null>(null);
  const [nova, setNova] = useState<{ carro?: string; visita?: string } | null>(null);

  // Outras telas mandam para cá: /ordens?abrir=<id> e /ordens?nova=1&carro=<id>.
  const [abrirParam, limparAbrir] = useParametroDeTela('abrir');
  const [novaParam, limparNova, params] = useParametroDeTela('nova');
  useEffect(() => {
    if (abrirParam) {
      setAberta(abrirParam);
      limparAbrir();
    }
  }, [abrirParam, limparAbrir]);
  useEffect(() => {
    if (novaParam && pode('atender')) {
      setNova({ carro: params.get('carro') ?? undefined, visita: params.get('visita') ?? undefined });
      limparNova();
    }
  }, [novaParam, limparNova, params, pode]);

  const assumir = useAcao((id: string) => http.post<OrdemServicoDTO>(`/ordens/${id}/assumir`), {
    invalidar: [['ordens']],
    sucesso: (os) => `A OS #${os.numero} agora é sua.`,
  });

  const souMecanico = usuario?.perfil === 'MECANICO';
  const mostraValor = pode('atender');

  /** Quem está com a OS — ou, para o mecânico, o botão de pegar uma OS sem ninguém. */
  const mecanicoDa = (o: OSResumoDTO) =>
    o.mecanico ? (
      o.mecanico.nome
    ) : souMecanico && o.status !== 'ENTREGUE' && o.status !== 'CANCELADA' ? (
      <button
        type="button"
        disabled={assumir.isPending}
        onClick={() => assumir.mutate(o.id)}
        className="inline-flex items-center gap-1 text-sm font-bold text-laranja hover:underline"
      >
        <UserCheck size={14} /> Assumir
      </button>
    ) : (
      <span className="text-grafite/40">—</span>
    );

  return (
    <div>
      <PageHeader
        title="Ordens de Serviço"
        subtitle={souMecanico && !pode('verTodasOS') ? 'As suas e as que ainda não têm mecânico' : `${lista.dados?.total ?? 0} OS nesta lista`}
      >
        <CampoBusca valor={lista.busca} onBuscar={lista.setBusca} placeholder="Nº, placa, cliente ou modelo..." autoFocus />
        {pode('atender') && (
          <BtnPrimary icone={Plus} onClick={() => setNova({})}>
            Nova OS
          </BtnPrimary>
        )}
      </PageHeader>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* No celular as abas quebram em duas linhas: rolando para o lado, a última
            ("Canceladas") ficava cortada sem ninguém saber que havia mais. */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 bg-white border border-linha rounded-xl p-1 sm:overflow-x-auto" role="tablist">
          {ABAS.map((a) => (
            <button
              key={a.id}
              role="tab"
              aria-selected={aba === a.id}
              onClick={() => setAba(a.id)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition whitespace-nowrap ${
                aba === a.id ? 'bg-petroleo text-white shadow-sm' : 'text-grafite/60 hover:bg-fundo'
              }`}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
        {pode('verTodasOS') && (
          <Selecao value={mecanicoId} onChange={(e) => setMecanicoId(e.target.value)} className="!w-auto !py-2 text-sm" aria-label="Filtrar por mecânico">
            <option value="">Todos os mecânicos</option>
            {(equipe.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </Selecao>
        )}
      </div>

      <Painel cabeNoCelular>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Nº</th>
              <th className={thCls}>Cliente e veículo</th>
              <th className={thCls}>Situação</th>
              {/* No celular estas colunas somem: o mecânico (e o "Assumir") vai para
                  baixo da situação, e o resto está na própria OS. */}
              <th className={`${thCls} ${soNoComputador}`}>Mecânico</th>
              <th className={`${thCls} ${soNoComputador}`}>Entrada</th>
              <th className={`${thCls} ${soNoComputador}`}>Previsão</th>
              {mostraValor && <th className={`${thCls} ${soNoComputador} text-right`}>Total</th>}
            </tr>
          </thead>
          <tbody>
            <EstadoTabela
              carregando={lista.consulta.isPending}
              erro={lista.consulta.error}
              vazio={itens.length === 0}
              colSpan={mostraValor ? 7 : 6}
              textoVazio={aba === 'oficina' && !lista.busca ? 'Nenhum carro na oficina agora.' : 'Nenhuma OS encontrada.'}
              onTentar={() => void lista.consulta.refetch()}
            />
            {itens.map((o) => (
              <tr key={o.id} onClick={() => setAberta(o.id)} className={`${linhaCls} cursor-pointer`}>
                <td className={`${tdCls} font-mono font-bold text-grafite/50`}>#{o.numero}</td>
                <td className={tdCls}>
                  <div className="font-bold">{o.cliente.nome}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Placa placa={o.carro.placa} />
                    <span className="text-xs text-grafite/55 truncate">{o.carro.modelo}</span>
                  </div>
                </td>
                <td className={tdCls}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge cor={CORES_STATUS_OS[o.status]}>{LABEL_STATUS_OS[o.status]}</Badge>
                    {o.garantia && (
                      <span title="Garantia" className="text-azul">
                        <ShieldCheck size={15} />
                      </span>
                    )}
                    {o.atrasada && (
                      <span title="Passou da previsão" className="text-vermelho inline-flex items-center gap-0.5 text-xs font-bold">
                        <AlertTriangle size={13} /> atrasada
                      </span>
                    )}
                  </div>
                  <div className="md:hidden mt-1.5 text-xs text-grafite/60" onClick={(e) => !o.mecanico && souMecanico && e.stopPropagation()}>
                    {mecanicoDa(o)}
                  </div>
                </td>
                <td className={`${tdCls} ${soNoComputador}`} onClick={(e) => !o.mecanico && souMecanico && e.stopPropagation()}>
                  {mecanicoDa(o)}
                </td>
                <td className={`${tdCls} ${soNoComputador} text-grafite/60 whitespace-nowrap`}>{dataBR(o.dataAbertura)}</td>
                <td className={`${tdCls} ${soNoComputador} whitespace-nowrap ${o.atrasada ? 'text-vermelho font-bold' : 'text-grafite/60'}`}>
                  {o.dataPrevista ? dataHoraBR(o.dataPrevista) : '—'}
                </td>
                {mostraValor && (
                  <td className={`${tdCls} ${soNoComputador} text-right whitespace-nowrap`}>
                    <div className="font-bold tabular-nums">{o.garantia && o.total === 0 ? '—' : brl(o.total)}</div>
                    {o.formaPagamento ? (
                      <div className="text-[11px] font-bold text-verde inline-flex items-center gap-0.5">
                        <CheckCircle2 size={11} /> {o.pago ? 'pago' : 'a prazo'}
                      </div>
                    ) : o.status === 'CONCLUIDA' && o.total > 0 ? (
                      <div className="text-[11px] font-bold text-amarelo">a receber</div>
                    ) : null}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <Paginacao pagina={lista.pagina} porPagina={lista.porPagina} total={lista.dados?.total ?? 0} onPagina={lista.setPagina} />
      </Painel>

      {aberta && <DetalheOS key={aberta} id={aberta} onFechar={() => setAberta(null)} onAbrir={setAberta} />}
      {nova && (
        <NovaOS
          carroInicial={nova.carro}
          visitaId={nova.visita}
          onFechar={() => setNova(null)}
          onCriada={(os) => {
            setNova(null);
            setAberta(os.id);
          }}
          onAbrirExistente={(id) => {
            setNova(null);
            setAberta(id);
          }}
        />
      )}
    </div>
  );
}
