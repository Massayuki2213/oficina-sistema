import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { VisitaDTO } from '@hermes/shared';
import { http } from '../../api/http';
import { useParametroDeTela } from '../../api/lista';
import { CORES_STATUS_VISITA, LABEL_STATUS_VISITA, LABEL_TIPO_VISITA, horaBR, paraDataISO } from '../../lib/format';
import { useSessao } from '../acesso/sessao';
import { Badge, BtnGhost, BtnPrimary, ErroAoCarregar, PageHeader } from '../../components/ui';
import { FormVisita } from './FormVisita';
import { QuadroDoDia } from './QuadroDoDia';

/** Segunda-feira da semana de `d`. */
function inicioDaSemana(d: Date) {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
}

const somarDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** "2026-10-27" → a data local (sem o fuso puxar para o dia anterior). */
const deDataISO = (s: string) => {
  const [a, m, d] = s.split('-').map(Number);
  return new Date(a, m - 1, d);
};

type Modo = 'semana' | 'dia';

export default function AgendaPage() {
  const { pode } = useSessao();
  // O dia em foco: na semana, a semana dele; no modo dia, ele mesmo.
  const [modo, setModo] = useState<Modo>('semana');
  const [foco, setFoco] = useState(() => new Date());
  const [aberta, setAberta] = useState<VisitaDTO | 'nova' | null>(null);
  const [diaNovo, setDiaNovo] = useState<string | undefined>();

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => somarDias(inicioDaSemana(foco), i)), [foco]);
  const de = modo === 'dia' ? paraDataISO(foco) : paraDataISO(dias[0]);
  const ate = modo === 'dia' ? paraDataISO(foco) : paraDataISO(dias[6]);
  const hoje = paraDataISO(new Date());

  const consulta = useQuery({ queryKey: ['agenda', de, ate], queryFn: () => http.get<VisitaDTO[]>('/agenda', { de, ate }) });

  const abrirDia = (d: Date) => {
    setFoco(d);
    setModo('dia');
  };

  // /agenda?dia=AAAA-MM-DD (vindo do painel): abre direto o quadro do dia.
  const [diaParam, limparDia] = useParametroDeTela('dia');
  useEffect(() => {
    if (diaParam && /^\d{4}-\d{2}-\d{2}$/.test(diaParam)) {
      setFoco(deDataISO(diaParam));
      setModo('dia');
      limparDia();
    }
  }, [diaParam, limparDia]);

  const [novaParam, limparNova] = useParametroDeTela('nova');
  useEffect(() => {
    if (novaParam && pode('atender')) {
      setDiaNovo(undefined);
      setAberta('nova');
      limparNova();
    }
  }, [novaParam, limparNova, pode]);

  const porDia = useMemo(() => {
    const m = new Map<string, VisitaDTO[]>();
    for (const v of consulta.data ?? []) {
      const k = paraDataISO(new Date(v.dataHora));
      m.set(k, [...(m.get(k) ?? []), v]);
    }
    return m;
  }, [consulta.data]);

  const rotulo =
    modo === 'dia'
      ? foco.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
      : `${dias[0].toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} a ${dias[6].toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })}`.replace(/\./g, '');
  const passo = modo === 'dia' ? 1 : 7;

  return (
    <div>
      <PageHeader title="Agenda" subtitle={rotulo}>
        <div className="flex items-center gap-1 bg-white border border-linha rounded-xl p-1" role="tablist" aria-label="Ver por">
          {(
            [
              ['semana', 'Semana'],
              ['dia', 'Dia'],
            ] as const
          ).map(([m, r]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={modo === m}
              onClick={() => setModo(m)}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition ${modo === m ? 'bg-petroleo text-white shadow-sm' : 'text-grafite/60 hover:bg-fundo'}`}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <BtnGhost onClick={() => setFoco((f) => somarDias(f, -passo))} titulo={modo === 'dia' ? 'Dia anterior' : 'Semana anterior'} className="!px-3">
            <ChevronLeft size={16} />
          </BtnGhost>
          <BtnGhost onClick={() => setFoco(new Date())}>{modo === 'dia' ? 'Hoje' : 'Esta semana'}</BtnGhost>
          <BtnGhost onClick={() => setFoco((f) => somarDias(f, passo))} titulo={modo === 'dia' ? 'Próximo dia' : 'Próxima semana'} className="!px-3">
            <ChevronRight size={16} />
          </BtnGhost>
        </div>
        {pode('atender') && (
          <BtnPrimary
            icone={Plus}
            onClick={() => {
              setDiaNovo(modo === 'dia' && paraDataISO(foco) >= hoje ? paraDataISO(foco) : undefined);
              setAberta('nova');
            }}
          >
            Marcar horário
          </BtnPrimary>
        )}
      </PageHeader>

      {consulta.error ? (
        <ErroAoCarregar erro={consulta.error} onTentar={() => void consulta.refetch()} />
      ) : modo === 'dia' ? (
        <QuadroDoDia visitas={consulta.data ?? []} carregando={consulta.isPending} onAbrir={setAberta} />
      ) : (
        <div className="grid md:grid-cols-7 gap-3">
          {dias.map((d) => {
            const k = paraDataISO(d);
            const lista = porDia.get(k) ?? [];
            const ehHoje = k === hoje;
            const passado = k < hoje;
            return (
              <section
                key={k}
                className={`bg-white rounded-2xl border shadow-sm flex flex-col min-h-[8rem] ${ehHoje ? 'border-laranja' : 'border-linha'} ${passado ? 'opacity-75' : ''}`}
              >
                <header className="flex items-center justify-between px-3 py-2 border-b border-linha">
                  <button
                    type="button"
                    onClick={() => abrirDia(d)}
                    title="Ver o dia inteiro"
                    className={`text-xs font-bold uppercase tracking-wide hover:underline ${ehHoje ? 'text-laranja' : 'text-grafite/50'}`}
                  >
                    {d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}{' '}
                    <span className="text-petroleo text-sm">{d.getDate()}</span>
                    {lista.length > 0 && <span className="ml-1.5 normal-case font-semibold text-grafite/45">({lista.length})</span>}
                  </button>
                  {pode('atender') && !passado && (
                    <button
                      type="button"
                      onClick={() => {
                        setDiaNovo(k);
                        setAberta('nova');
                      }}
                      className="text-grafite/30 hover:text-laranja"
                      aria-label={`Marcar horário em ${d.toLocaleDateString('pt-BR')}`}
                    >
                      <Plus size={16} />
                    </button>
                  )}
                </header>
                <div className="p-2 space-y-1.5 flex-1">
                  {consulta.isPending && <div className="text-xs text-grafite/30 text-center py-3">...</div>}
                  {lista.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setAberta(v)}
                      className={`w-full text-left rounded-lg px-2.5 py-2 border transition hover:shadow-sm ${
                        v.status === 'FALTOU' || v.status === 'REALIZADA' ? 'border-linha bg-fundo/60' : 'border-laranja/25 bg-laranja/5'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-sm tabular-nums text-petroleo">{horaBR(v.dataHora)}</span>
                        <span className="text-[11px] text-grafite/50 truncate">{LABEL_TIPO_VISITA[v.tipo]}</span>
                      </div>
                      <div className="text-sm font-bold truncate">{v.cliente.nome}</div>
                      {v.carro && <div className="text-xs text-grafite/55 truncate">{v.carro.modelo}</div>}
                      {v.status !== 'AGENDADA' && (
                        <div className="mt-1">
                          <Badge cor={CORES_STATUS_VISITA[v.status]}>{LABEL_STATUS_VISITA[v.status]}</Badge>
                        </div>
                      )}
                    </button>
                  ))}
                  {!consulta.isPending && lista.length === 0 && <div className="text-xs text-grafite/30 text-center py-3">livre</div>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {aberta && <FormVisita visita={aberta === 'nova' ? null : aberta} diaInicial={diaNovo} onFechar={() => setAberta(null)} />}
    </div>
  );
}
