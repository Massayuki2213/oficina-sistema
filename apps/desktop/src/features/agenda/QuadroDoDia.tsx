import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, ClipboardList, FileText, UserCheck, UserX } from 'lucide-react';
import type { StatusVisita, VisitaDTO } from '@hermes/shared';
import { http, mensagemDeErro } from '../../api/http';
import { useOficina } from '../../api/catalogo';
import { useAvisos } from '../../lib/avisos';
import { LABEL_TIPO_VISITA, formatarTelefone, horaBR } from '../../lib/format';
import { linkWhatsApp, mensagens } from '../../lib/whatsapp';
import { useSessao } from '../acesso/sessao';
import { Badge, BtnWhatsApp, MenuMais, Placa } from '../../components/ui';

// ============================================================
// O dia da agenda como um quadro de tarefas: quem ainda vai chegar,
// quem chegou e quem faltou — com o carro inteiro à vista e as ações
// no próprio cartão. "Chegou" abre o orçamento (ou a OS) já com o
// cliente e o carro; ao salvar, o horário passa a "chegou" e mostra
// o número do atendimento.
// ============================================================

const A_CHEGAR: StatusVisita[] = ['AGENDADA', 'CONFIRMADA'];

const porHora = (a: VisitaDTO, b: VisitaDTO) => a.dataHora.localeCompare(b.dataHora);

export function QuadroDoDia({ visitas, carregando, onAbrir }: { visitas: VisitaDTO[]; carregando: boolean; onAbrir: (v: VisitaDTO) => void }) {
  const aChegar = visitas.filter((v) => A_CHEGAR.includes(v.status)).sort(porHora);
  const chegaram = visitas.filter((v) => v.status === 'REALIZADA').sort(porHora);
  const faltaram = visitas.filter((v) => v.status === 'FALTOU').sort(porHora);

  return (
    <div className="space-y-3">
      <p className="text-sm text-grafite/65">
        {carregando ? (
          'Carregando...'
        ) : (
          <>
            <strong className="text-petroleo">{visitas.length === 1 ? '1 horário' : `${visitas.length} horários`}</strong>
            {visitas.length > 0 && ` — ${aChegar.length} a chegar · ${chegaram.length} chegou · ${faltaram.length} faltou`}
          </>
        )}
      </p>
      <div className="grid md:grid-cols-3 gap-3 items-start">
        <Coluna titulo="A chegar" qtd={aChegar.length} destaque vazio="Ninguém mais para chegar.">
          {aChegar.map((v) => (
            <Cartao key={v.id} v={v} onAbrir={onAbrir} />
          ))}
        </Coluna>
        <Coluna titulo="Chegou" qtd={chegaram.length} vazio="Ninguém chegou ainda.">
          {chegaram.map((v) => (
            <Cartao key={v.id} v={v} onAbrir={onAbrir} />
          ))}
        </Coluna>
        <Coluna titulo="Faltou" qtd={faltaram.length} vazio="Nenhuma falta.">
          {faltaram.map((v) => (
            <Cartao key={v.id} v={v} onAbrir={onAbrir} />
          ))}
        </Coluna>
      </div>
    </div>
  );
}

function Coluna({ titulo, qtd, destaque, vazio, children }: { titulo: string; qtd: number; destaque?: boolean; vazio: string; children: ReactNode }) {
  return (
    <section className={`bg-white rounded-2xl border shadow-sm ${destaque ? 'border-laranja/40' : 'border-linha'}`}>
      <header className="flex items-center justify-between px-3.5 py-2.5 border-b border-linha">
        <h2 className={`text-xs font-bold uppercase tracking-wide ${destaque ? 'text-laranja' : 'text-grafite/55'}`}>{titulo}</h2>
        <span className="text-sm font-extrabold text-petroleo tabular-nums">{qtd}</span>
      </header>
      <div className="p-2.5 space-y-2.5">{qtd === 0 ? <div className="text-xs text-grafite/35 text-center py-4">{vazio}</div> : children}</div>
    </section>
  );
}

function Cartao({ v, onAbrir }: { v: VisitaDTO; onAbrir: (v: VisitaDTO) => void }) {
  const { pode } = useSessao();
  const oficina = useOficina();
  const navegar = useNavigate();
  const qc = useQueryClient();
  const avisos = useAvisos();
  const balcao = pode('atender');
  const aChegar = A_CHEGAR.includes(v.status);
  const semAtendimento = !v.orcamento && !v.os;
  const telefone = v.cliente.whatsapp ?? v.cliente.telefone;

  async function mudar(status: StatusVisita, sucesso: string) {
    try {
      await http.patch(`/agenda/${v.id}/status`, { status });
      await qc.invalidateQueries({ queryKey: ['agenda'] });
      avisos.sucesso(sucesso);
    } catch (e) {
      avisos.erro(mensagemDeErro(e));
    }
  }

  // O orçamento/OS salvo a partir do horário marca "chegou" e guarda o número.
  const fazerOrcamento = () =>
    navegar(`/orcamentos?novo=1&visita=${v.id}${v.carro ? `&carro=${v.carro.id}` : `&cliente=${v.cliente.id}`}`);
  const abrirOS = () => v.carro && navegar(`/ordens?nova=1&visita=${v.id}&carro=${v.carro.id}`);

  return (
    <article className={`rounded-xl border px-3 py-2.5 ${aChegar ? 'border-laranja/25 bg-laranja/5' : 'border-linha bg-fundo/50'}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-extrabold tabular-nums text-petroleo">{horaBR(v.dataHora)}</span>
        <span className="text-xs text-grafite/55">{LABEL_TIPO_VISITA[v.tipo]}</span>
        {v.status === 'CONFIRMADA' && <Badge cor="bg-verde-bg text-verde">Confirmado</Badge>}
      </div>

      <button type="button" onClick={() => onAbrir(v)} className="block text-left mt-1 group" title="Ver o horário">
        <span className="block font-bold text-sm text-petroleo group-hover:underline">{v.cliente.nome}</span>
        {telefone && <span className="block text-xs text-grafite/50">{formatarTelefone(telefone)}</span>}
      </button>

      {v.carro ? (
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <Placa placa={v.carro.placa} />
          <span className="text-sm font-semibold text-grafite/80">{[v.carro.marca, v.carro.modelo, v.carro.ano].filter(Boolean).join(' ')}</span>
        </div>
      ) : (
        <div className="text-xs text-grafite/45 mt-1.5">Carro não informado</div>
      )}

      {v.observacoes && <p className="text-xs text-grafite/65 italic mt-1.5 line-clamp-2">"{v.observacoes}"</p>}

      {!semAtendimento && (
        <div className="flex gap-2 flex-wrap mt-2 text-xs font-bold">
          {v.orcamento && (
            <button type="button" onClick={() => navegar(`/orcamentos?abrir=${v.orcamento!.id}`)} className="text-laranja hover:underline inline-flex items-center gap-1">
              <FileText size={12} /> Orçamento #{v.orcamento.numero}
            </button>
          )}
          {(v.orcamento?.os ?? v.os) && (
            <button
              type="button"
              onClick={() => navegar(`/ordens?abrir=${(v.orcamento?.os ?? v.os)!.id}`)}
              className="text-laranja hover:underline inline-flex items-center gap-1"
            >
              <ClipboardList size={12} /> OS #{(v.orcamento?.os ?? v.os)!.numero}
            </button>
          )}
        </div>
      )}

      {balcao && aChegar && (
        <div className="flex items-center gap-2 flex-wrap mt-2.5">
          <MenuMais
            rotulo="Chegou"
            paraBaixo
            itens={[
              { rotulo: 'Fazer orçamento', icone: FileText, onClick: fazerOrcamento },
              { rotulo: 'Abrir OS (serviço já autorizado)', icone: ClipboardList, onClick: () => void abrirOS(), visivel: !!v.carro },
              { rotulo: 'Só marcar que chegou', icone: UserCheck, onClick: () => void mudar('REALIZADA', `${v.cliente.nome} chegou.`) },
            ]}
          />
          {v.status === 'AGENDADA' && (
            <button
              type="button"
              onClick={() => void mudar('CONFIRMADA', 'Horário confirmado.')}
              className="text-xs font-bold text-grafite/60 hover:text-verde inline-flex items-center gap-1"
            >
              <CalendarCheck size={13} /> Confirmado
            </button>
          )}
          <button
            type="button"
            onClick={() => void mudar('FALTOU', 'Falta registrada.')}
            className="text-xs font-bold text-grafite/60 hover:text-vermelho inline-flex items-center gap-1"
          >
            <UserX size={13} /> Faltou
          </button>
          <BtnWhatsApp compacto href={linkWhatsApp(telefone, mensagens.lembreteVisita(v, oficina))}>
            Lembrar
          </BtnWhatsApp>
        </div>
      )}

      {balcao && v.status === 'REALIZADA' && semAtendimento && (
        <div className="flex items-center gap-3 flex-wrap mt-2.5 text-xs font-bold">
          <button type="button" onClick={fazerOrcamento} className="text-laranja hover:underline inline-flex items-center gap-1">
            <FileText size={12} /> Fazer orçamento
          </button>
          {v.carro && (
            <button type="button" onClick={() => void abrirOS()} className="text-laranja hover:underline inline-flex items-center gap-1">
              <ClipboardList size={12} /> Abrir OS
            </button>
          )}
        </div>
      )}
    </article>
  );
}
