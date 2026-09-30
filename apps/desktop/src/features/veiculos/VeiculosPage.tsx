import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, ShieldCheck, ClipboardList } from 'lucide-react';
import { brl, type CarroDTO, type FichaVeiculoDTO } from '@hermes/shared';
import { http } from '../../api/http';
import { useAcao } from '../../api/acoes';
import { useListaPaginada, useParametroDeTela } from '../../api/lista';
import { useAvisos } from '../../lib/avisos';
import { CORES_STATUS_OS, LABEL_STATUS_OS, dataBR, formatarTelefone } from '../../lib/format';
import { useSessao } from '../acesso/sessao';
import {
  AcaoEditar,
  AcaoExcluir,
  Badge,
  BtnGhost,
  BtnPrimary,
  CampoBusca,
  EstadoTabela,
  InfoLinha,
  Modal,
  PageHeader,
  Paginacao,
  Painel,
  Placa,
  Secao,
  Vazio,
  linhaCls,
  tdCls,
  thCls,
} from '../../components/ui';
import FormVeiculo from './FormVeiculo';

export default function VeiculosPage() {
  const { pode } = useSessao();
  const avisos = useAvisos();
  const lista = useListaPaginada<CarroDTO>('carros', '/carros');
  const [editando, setEditando] = useState<CarroDTO | 'novo' | null>(null);
  const [ficha, setFicha] = useState<string | null>(null);
  const [novo, limparNovo, params] = useParametroDeTela('novo');
  const [placaInicial, setPlacaInicial] = useState('');
  const itens = lista.dados?.itens ?? [];

  // Vindo da busca por placa: /veiculos?novo=1&placa=ABC1D23
  useEffect(() => {
    if (novo) {
      setPlacaInicial(params.get('placa') ?? '');
      setEditando('novo');
      limparNovo();
    }
  }, [novo, limparNovo, params]);

  const excluir = useAcao((c: CarroDTO) => http.delete(`/carros/${c.id}`), {
    invalidar: [['carros'], ['clientes']],
    sucesso: 'Veículo excluído da lista. As OS antigas continuam no histórico.',
  });

  return (
    <div>
      <PageHeader title="Veículos" subtitle={`${lista.dados?.total ?? 0} veículo(s)`}>
        <CampoBusca valor={lista.busca} onBuscar={lista.setBusca} placeholder="Placa, modelo ou dono..." autoFocus />
        <BtnPrimary icone={Plus} onClick={() => setEditando('novo')}>
          Novo veículo
        </BtnPrimary>
      </PageHeader>

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Placa</th>
              <th className={thCls}>Veículo</th>
              <th className={thCls}>Ano</th>
              <th className={thCls}>KM</th>
              <th className={thCls}>Dono</th>
              <th className={`${thCls} text-right`}>Ações</th>
            </tr>
          </thead>
          <tbody>
            <EstadoTabela
              carregando={lista.consulta.isPending}
              erro={lista.consulta.error}
              vazio={itens.length === 0}
              colSpan={6}
              onTentar={() => void lista.consulta.refetch()}
            />
            {itens.map((c) => (
              <tr key={c.id} onClick={() => setFicha(c.id)} className={`${linhaCls} cursor-pointer`}>
                <td className={tdCls}>
                  <Placa placa={c.placa} />
                </td>
                <td className={`${tdCls} font-bold`}>
                  {c.marca} {c.modelo}
                  {c.cor && <span className="font-normal text-grafite/50"> · {c.cor}</span>}
                </td>
                <td className={tdCls}>{c.ano ?? '—'}</td>
                <td className={`${tdCls} tabular-nums`}>{c.kmAtual != null ? `${c.kmAtual.toLocaleString('pt-BR')} km` : '—'}</td>
                <td className={tdCls}>{c.cliente.nome}</td>
                <td className={`${tdCls} text-right whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
                  <AcaoEditar onClick={() => setEditando(c)} />
                  {pode('apagarRegistros') && (
                    <AcaoExcluir
                      onClick={async () => {
                        const ok = await avisos.confirmar({
                          titulo: 'Excluir veículo',
                          mensagem: `${c.marca} ${c.modelo} sai da lista. As OS antigas são preservadas.`,
                          botao: 'Excluir',
                          perigo: true,
                        });
                        if (ok) excluir.mutate(c);
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

      {editando && (
        <FormVeiculo
          veiculo={editando === 'novo' ? null : editando}
          placaInicial={placaInicial}
          onFechar={() => {
            setEditando(null);
            setPlacaInicial('');
          }}
          onSalvo={() => {
            setEditando(null);
            setPlacaInicial('');
          }}
        />
      )}
      {ficha && <FichaVeiculo id={ficha} onFechar={() => setFicha(null)} />}
    </div>
  );
}

function FichaVeiculo({ id, onFechar }: { id: string; onFechar: () => void }) {
  const navegar = useNavigate();
  const { pode } = useSessao();
  const { data: v } = useQuery({ queryKey: ['carros', id], queryFn: () => http.get<FichaVeiculoDTO>(`/carros/${id}`) });

  return (
    <Modal
      title={v ? `${v.marca} ${v.modelo}` : 'Veículo'}
      size="lg"
      onClose={onFechar}
      semConfirmarDescarte
      footer={
        <>
          <BtnGhost onClick={onFechar}>Fechar</BtnGhost>
          {v && pode('atender') && (
            <BtnPrimary icone={ClipboardList} onClick={() => navegar(`/ordens?nova=1&carro=${v.id}`)}>
              Abrir OS para este carro
            </BtnPrimary>
          )}
        </>
      }
    >
      {!v ? (
        <div className="text-center text-grafite/40 py-8 text-sm">Carregando...</div>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <Placa placa={v.placa} grande />
            <span className="text-sm text-grafite/60">
              {[v.ano, v.cor, v.combustivel, v.kmAtual != null ? `${v.kmAtual.toLocaleString('pt-BR')} km` : null].filter(Boolean).join(' · ')}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 bg-fundo rounded-xl p-3 text-sm">
            <InfoLinha rotulo="Dono" valor={v.cliente.nome} />
            <InfoLinha rotulo="Telefone" valor={formatarTelefone(v.cliente.whatsapp ?? v.cliente.telefone)} />
            <InfoLinha rotulo="Chassi" valor={v.chassi} />
            <InfoLinha rotulo="Observações" valor={v.observacoes} />
          </div>
          <Secao titulo={`Histórico (${v.historico.length})`}>
            {v.historico.length === 0 ? (
              <Vazio>Nenhum serviço registrado neste carro ainda.</Vazio>
            ) : (
              <div className="border border-linha rounded-xl divide-y divide-linha">
                {v.historico.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => navegar(`/ordens?abrir=${o.id}`)}
                    className="w-full text-left flex items-start gap-3 px-3.5 py-2.5 hover:bg-fundo/50"
                  >
                    <div className="text-xs font-mono font-bold text-grafite/40 pt-0.5 w-10 shrink-0">#{o.numero}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{o.servicos.join(', ') || 'Sem serviço lançado'}</div>
                      <div className="text-xs text-grafite/50">
                        {dataBR(o.dataAbertura)}
                        {o.kmEntrada != null && ` · ${o.kmEntrada.toLocaleString('pt-BR')} km`}
                        {o.mecanico && ` · ${o.mecanico}`}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold tabular-nums">{o.garantia ? '—' : brl(o.total)}</div>
                      <div className="flex items-center gap-1 justify-end mt-0.5">
                        {o.garantia && <ShieldCheck size={13} className="text-azul" />}
                        <Badge cor={CORES_STATUS_OS[o.status]}>{LABEL_STATUS_OS[o.status]}</Badge>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Secao>
        </>
      )}
    </Modal>
  );
}
