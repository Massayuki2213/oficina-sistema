import { useState } from 'react';
import { Plus } from 'lucide-react';
import { brl, type ServicoDTO } from '@hermes/shared';
import { http } from '../../api/http';
import { useAcao } from '../../api/acoes';
import { useListaPaginada } from '../../api/lista';
import { useAvisos } from '../../lib/avisos';
import { useSessao } from '../acesso/sessao';
import {
  AcaoEditar,
  AcaoExcluir,
  Badge,
  BtnPrimary,
  CampoBusca,
  EstadoTabela,
  PageHeader,
  Paginacao,
  Painel,
  linhaCls,
  tdCls,
  thCls,
} from '../../components/ui';
import FormServico from './FormServico';

export default function ServicosPage() {
  const { pode } = useSessao();
  const avisos = useAvisos();
  const lista = useListaPaginada<ServicoDTO>('servicos', '/servicos');
  const [editando, setEditando] = useState<ServicoDTO | null | 'novo'>(null);
  const itens = lista.dados?.itens ?? [];

  const excluir = useAcao((s: ServicoDTO) => http.delete(`/servicos/${s.id}`), {
    invalidar: [['servicos']],
    sucesso: 'Serviço tirado do catálogo.',
  });

  async function confirmarExclusao(s: ServicoDTO) {
    const ok = await avisos.confirmar({
      titulo: 'Tirar do catálogo',
      mensagem: `"${s.nome}" sai do catálogo. As OS e orçamentos antigos continuam com ele.`,
      botao: 'Tirar do catálogo',
      perigo: true,
    });
    if (ok) excluir.mutate(s);
  }

  return (
    <div>
      <PageHeader title="Serviços" subtitle={`${lista.dados?.total ?? 0} no catálogo de mão de obra`}>
        <CampoBusca valor={lista.busca} onBuscar={lista.setBusca} placeholder="Nome ou categoria..." />
        {pode('atender') && (
          <BtnPrimary icone={Plus} onClick={() => setEditando('novo')}>
            Novo serviço
          </BtnPrimary>
        )}
      </PageHeader>

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Serviço</th>
              <th className={thCls}>Categoria</th>
              <th className={`${thCls} text-right`}>Mão de obra</th>
              <th className={thCls}>Tempo estimado</th>
              {pode('atender') && <th className={`${thCls} text-right`}>Ações</th>}
            </tr>
          </thead>
          <tbody>
            <EstadoTabela
              carregando={lista.consulta.isPending}
              erro={lista.consulta.error}
              vazio={itens.length === 0}
              colSpan={5}
              onTentar={() => void lista.consulta.refetch()}
              textoVazio={lista.busca ? 'Nenhum serviço com esse nome.' : 'Nenhum serviço cadastrado — cadastre o que a oficina faz.'}
            />
            {itens.map((s) => (
              <tr key={s.id} className={linhaCls}>
                <td className={`${tdCls} font-bold`}>
                  {s.nome}
                  {s.descricao && <div className="text-xs text-grafite/50 font-normal">{s.descricao}</div>}
                </td>
                <td className={tdCls}>{s.categoria ? <Badge cor="bg-azul-bg text-azul">{s.categoria}</Badge> : '—'}</td>
                <td className={`${tdCls} text-right font-bold tabular-nums`}>{brl(s.precoMaoDeObra)}</td>
                <td className={tdCls}>{s.tempoEstimadoMin ? `${s.tempoEstimadoMin} min` : '—'}</td>
                {pode('atender') && (
                  <td className={`${tdCls} text-right whitespace-nowrap`}>
                    <AcaoEditar onClick={() => setEditando(s)} />
                    {pode('apagarRegistros') && <AcaoExcluir onClick={() => void confirmarExclusao(s)} />}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <Paginacao pagina={lista.pagina} porPagina={lista.porPagina} total={lista.dados?.total ?? 0} onPagina={lista.setPagina} />
      </Painel>

      {editando && (
        <FormServico
          servico={editando === 'novo' ? null : editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => setEditando(null)}
        />
      )}
    </div>
  );
}
