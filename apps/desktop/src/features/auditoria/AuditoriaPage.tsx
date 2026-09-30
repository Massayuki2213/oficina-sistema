import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LABEL_PERFIL, type EntidadeAuditadaDTO, type LogAuditoriaDTO, type MudancaDTO } from '@hermes/shared';
import { http } from '../../api/http';
import { useEquipe } from '../../api/catalogo';
import { useListaPaginada } from '../../api/lista';
import { dataHoraBR } from '../../lib/format';
import { rangeDe, type PeriodoKey } from '../../lib/periodo';
import { CampoBusca, EstadoTabela, PageHeader, Paginacao, Painel, Periodo, Selecao, linhaCls, tdCls, thCls } from '../../components/ui';

/** Quem fez o quê, e quando. Nada que mexe em dinheiro, estoque ou cadastro passa sem registro. */
export default function AuditoriaPage() {
  const [periodo, setPeriodo] = useState<PeriodoKey>('semana');
  const [entidade, setEntidade] = useState('');
  const [usuarioId, setUsuarioId] = useState('');
  const entidades = useQuery({ queryKey: ['auditoria', 'entidades'], queryFn: () => http.get<EntidadeAuditadaDTO[]>('/auditoria/entidades') });
  const equipe = useEquipe();
  const lista = useListaPaginada<LogAuditoriaDTO>(
    'auditoria',
    '/auditoria',
    { ...rangeDe(periodo), entidade: entidade || undefined, usuarioId: usuarioId || undefined },
    50,
  );
  const itens = lista.dados?.itens ?? [];

  return (
    <div>
      <PageHeader title="Histórico" subtitle="Quem fez o quê no sistema, e quando">
        <CampoBusca valor={lista.busca} onBuscar={lista.setBusca} placeholder="Buscar nos detalhes..." />
      </PageHeader>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Periodo value={periodo} onChange={setPeriodo} />
        <Selecao value={entidade} onChange={(e) => setEntidade(e.target.value)} className="!w-auto !py-2 text-sm" aria-label="O quê">
          <option value="">Tudo</option>
          {(entidades.data ?? []).map((e) => (
            <option key={e.entidade} value={e.entidade}>
              {e.rotulo} ({e.total})
            </option>
          ))}
        </Selecao>
        <Selecao value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)} className="!w-auto !py-2 text-sm" aria-label="Quem">
          <option value="">Todas as pessoas</option>
          {(equipe.data ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </Selecao>
      </div>

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Quando</th>
              <th className={thCls}>Quem</th>
              <th className={thCls}>O quê</th>
              <th className={thCls}>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            <EstadoTabela
              carregando={lista.consulta.isPending}
              erro={lista.consulta.error}
              vazio={itens.length === 0}
              colSpan={4}
              textoVazio="Nada registrado neste período."
              onTentar={() => void lista.consulta.refetch()}
            />
            {itens.map((l) => (
              <tr key={l.id} className={linhaCls}>
                <td className={`${tdCls} whitespace-nowrap text-grafite/60 tabular-nums`}>{dataHoraBR(l.data)}</td>
                <td className={tdCls}>
                  {l.usuario ? (
                    <>
                      <div className="font-bold">{l.usuario.nome}</div>
                      <div className="text-xs text-grafite/45">{LABEL_PERFIL[l.usuario.perfil]}</div>
                    </>
                  ) : (
                    <span className="text-grafite/40">sistema</span>
                  )}
                </td>
                <td className={`${tdCls} font-semibold`}>{l.descricao}</td>
                <td className={`${tdCls} text-xs text-grafite/55 max-w-md`}>
                  {l.mudancas?.length ? (
                    <Mudancas lista={l.mudancas} titulo={l.detalhes ?? undefined} />
                  ) : (
                    <span className="line-clamp-2 break-all" title={l.detalhes ?? undefined}>
                      {l.detalhes ?? '—'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Paginacao pagina={lista.pagina} porPagina={lista.porPagina} total={lista.dados?.total ?? 0} onPagina={lista.setPagina} />
      </Painel>
    </div>
  );
}

/** "Preço de venda: R$ 80,00 → R$ 50,00" — o valor anterior riscado, o novo em destaque. */
function Mudancas({ lista, titulo }: { lista: MudancaDTO[]; titulo?: string }) {
  return (
    <ul className="space-y-0.5" title={titulo}>
      {lista.map((m) => (
        <li key={m.campo} className="leading-snug">
          <span className="font-semibold text-grafite/70">{m.campo}:</span>{' '}
          <span className="line-through decoration-grafite/30">{m.de}</span>
          <span className="text-grafite/40" aria-label="passou para">
            {' '}
            →{' '}
          </span>
          <span className="font-bold text-petroleo">{m.para}</span>
        </li>
      ))}
    </ul>
  );
}
