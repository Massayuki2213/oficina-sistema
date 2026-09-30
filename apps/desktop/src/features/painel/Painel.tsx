import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarDays,
  Car,
  CheckCircle2,
  ClipboardList,
  FileClock,
  FileText,
  HandCoins,
  PackageMinus,
  Phone,
  ShoppingBag,
  TrendingUp,
  Truck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import {
  brl,
  formatarQtd,
  type AlertasDTO,
  type OSResumoDTO,
  type Pagina,
  type ResumoFinanceiroDTO,
  type VisitaDTO,
} from '@hermes/shared';
import { http } from '../../api/http';
import { useOficina } from '../../api/catalogo';
import { CORES_STATUS_OS, CORES_STATUS_VISITA, LABEL_STATUS_OS, LABEL_STATUS_VISITA, LABEL_TIPO_VISITA, dataBR, diaLongoBR, hojeISO, horaBR, relativo } from '../../lib/format';
import { rangeDe } from '../../lib/periodo';
import { linkWhatsApp, mensagens } from '../../lib/whatsapp';
import { useSessao } from '../acesso/sessao';
import { Badge, BtnWhatsApp, ErroAoCarregar, Kpi, Placa } from '../../components/ui';

// ============================================================
// Início: o dia da oficina numa tela. Cada perfil vê o que pode
// resolver — o servidor já manda os alertas filtrados.
// ============================================================

function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

const totalDe = (caminho: string, filtros: Record<string, string | boolean>) => () =>
  http.get<Pagina<unknown>>(caminho, { ...filtros, porPagina: 1 }).then((p) => p.total);

export default function Painel() {
  const { usuario, pode } = useSessao();
  const hoje = hojeISO();

  const naOficina = useQuery({ queryKey: ['ordens', 'total', 'abertas'], queryFn: totalDe('/ordens', { abertas: true }) });
  const prontas = useQuery({ queryKey: ['ordens', 'total', 'prontas'], queryFn: totalDe('/ordens', { status: 'CONCLUIDA' }) });
  const agenda = useQuery({ queryKey: ['agenda', hoje], queryFn: () => http.get<VisitaDTO[]>('/agenda', { de: hoje, ate: hoje }) });
  const alertas = useQuery({ queryKey: ['alertas'], queryFn: () => http.get<AlertasDTO>('/alertas'), refetchInterval: 5 * 60_000 });
  const mes = useQuery({
    queryKey: ['relatorios', 'resumo', 'mes'],
    queryFn: () => http.get<ResumoFinanceiroDTO>('/relatorios/resumo', rangeDe('mes')),
    enabled: pode('verFinanceiro'),
  });
  const minhas = useQuery({
    queryKey: ['ordens', 'minhas', usuario?.id],
    queryFn: () => http.get<Pagina<OSResumoDTO>>('/ordens', { abertas: true, porPagina: 50 }),
    enabled: usuario?.perfil === 'MECANICO',
  });

  if (!usuario) return null;
  const visitas = (agenda.data ?? []).filter((v) => v.status === 'AGENDADA' || v.status === 'CONFIRMADA');

  return (
    <div className="space-y-5">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-petroleo">
            {saudacao()}, {usuario.nome.split(' ')[0]}!
          </h1>
          <p className="text-grafite/50 text-sm mt-0.5">{diaLongoBR(new Date())}</p>
        </div>
        <div className="flex-1" />
        {pode('atender') && (
          <div className="flex gap-2 flex-wrap">
            <Atalho icone={ClipboardList} rotulo="Nova OS" para="/ordens?nova=1" destaque />
            <Atalho icone={FileText} rotulo="Orçamento" para="/orcamentos?novo=1" />
            {pode('receberPagamentos') && <Atalho icone={ShoppingBag} rotulo="Venda" para="/vendas?nova=1" />}
            <Atalho icone={CalendarDays} rotulo="Agendar" para="/agenda?nova=1" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Link to="/ordens" className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-laranja">
          <Kpi label="Carros na oficina" valor={naOficina.data ?? '—'} icon={Car} cor="bg-azul-bg text-azul" sub="OS em aberto" />
        </Link>
        <Link to="/ordens" className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-laranja">
          <Kpi label="Prontos para entregar" valor={prontas.data ?? '—'} icon={CheckCircle2} cor="bg-verde-bg text-verde" sub="concluídos, aguardando o cliente" />
        </Link>
        <Link to="/agenda" className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-laranja">
          <Kpi label="Agenda de hoje" valor={agenda.data ? visitas.length : '—'} icon={CalendarDays} cor="bg-amarelo-bg text-amarelo" sub="horários marcados" />
        </Link>
        {pode('verFinanceiro') ? (
          <Link to="/relatorios" className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-laranja">
            <Kpi
              label="Faturamento do mês"
              valor={mes.data ? brl(mes.data.faturamento) : '—'}
              icon={TrendingUp}
              cor="bg-laranja/10 text-laranja"
              sub={mes.data ? `lucro ${brl(mes.data.lucro)} · ${mes.data.numOrdens} OS entregues` : undefined}
            />
          </Link>
        ) : (
          <Kpi label="Alertas" valor={alertas.data?.total ?? '—'} icon={AlertTriangle} cor="bg-vermelho-bg text-vermelho" sub="precisam de atenção" />
        )}
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5 items-start">
        <div className="space-y-5">
          {usuario.perfil === 'MECANICO' && <MinhasOS ordens={minhas.data?.itens ?? []} carregando={minhas.isPending} meuId={usuario.id} />}
          {alertas.error ? (
            <Cartao titulo="Alertas">
              <ErroAoCarregar erro={alertas.error} onTentar={() => void alertas.refetch()} />
            </Cartao>
          ) : (
            alertas.data && <Alertas a={alertas.data} />
          )}
        </div>
        <AgendaDeHoje visitas={visitas} carregando={agenda.isPending} />
      </div>
    </div>
  );
}

function Atalho({ icone: Icone, rotulo, para, destaque }: { icone: LucideIcon; rotulo: string; para: string; destaque?: boolean }) {
  return (
    <Link
      to={para}
      className={`inline-flex items-center gap-1.5 font-bold px-3.5 py-2.5 rounded-xl text-sm transition ${
        destaque ? 'bg-laranja hover:bg-laranja-deep text-white shadow-md shadow-laranja/25' : 'bg-white border border-linha text-petroleo hover:bg-fundo'
      }`}
    >
      <Icone size={16} /> {rotulo}
    </Link>
  );
}

function Cartao({ titulo, icone: Icone, acao, children }: { titulo: string; icone?: LucideIcon; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-linha shadow-sm">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-linha">
        {Icone && <Icone size={17} className="text-grafite/45" />}
        <h2 className="font-extrabold text-petroleo text-sm">{titulo}</h2>
        <div className="flex-1" />
        {acao}
      </header>
      <div>{children}</div>
    </section>
  );
}

const linha = 'flex items-center gap-3 px-4 py-2.5 border-b border-fundo last:border-0 text-sm';

function MinhasOS({ ordens, carregando, meuId }: { ordens: OSResumoDTO[]; carregando: boolean; meuId: string }) {
  const minhas = ordens.filter((o) => o.mecanico?.id === meuId);
  const livres = ordens.filter((o) => !o.mecanico);
  return (
    <Cartao titulo={`Minhas OS (${minhas.length})`} icone={Wrench} acao={<Link to="/ordens" className="text-xs font-bold text-laranja hover:underline">Ver todas</Link>}>
      {carregando && <div className="px-4 py-6 text-center text-sm text-grafite/40">Carregando...</div>}
      {!carregando && minhas.length === 0 && <div className="px-4 py-6 text-center text-sm text-grafite/40">Nenhuma OS com você agora.</div>}
      {minhas.map((o) => (
        <LinhaOS key={o.id} o={o} />
      ))}
      {livres.length > 0 && (
        <div className="px-4 py-2.5 bg-fundo/60 text-sm text-grafite/60 rounded-b-2xl">
          {livres.length} OS sem mecânico —{' '}
          <Link to="/ordens" className="font-bold text-laranja hover:underline">
            pegar uma
          </Link>
        </div>
      )}
    </Cartao>
  );
}

function LinhaOS({ o, extra }: { o: OSResumoDTO; extra?: ReactNode }) {
  return (
    <Link to={`/ordens?abrir=${o.id}`} className={`${linha} hover:bg-fundo/50`}>
      <span className="font-mono font-bold text-grafite/40 text-xs w-10 shrink-0">#{o.numero}</span>
      <Placa placa={o.carro.placa} />
      <span className="flex-1 min-w-0 truncate">
        <strong>{o.carro.modelo}</strong> <span className="text-grafite/50">· {o.cliente.nome}</span>
      </span>
      {extra ?? <Badge cor={CORES_STATUS_OS[o.status]}>{LABEL_STATUS_OS[o.status]}</Badge>}
    </Link>
  );
}

function Alertas({ a }: { a: AlertasDTO }) {
  const oficina = useOficina();
  const nada =
    a.total === 0 ||
    (a.osAtrasadas.length === 0 &&
      a.estoqueBaixo.length === 0 &&
      !a.revisaoVencida?.length &&
      !a.orcamentosVencendo?.length &&
      !a.fiadoEmAtraso?.length &&
      !a.comprasVencendo?.length);

  if (nada) {
    return (
      <Cartao titulo="Alertas" icone={CheckCircle2}>
        <div className="px-4 py-8 text-center text-sm text-grafite/50">Tudo em dia. Nenhum alerta agora.</div>
      </Cartao>
    );
  }

  return (
    <div className="space-y-5">
      {a.osAtrasadas.length > 0 && (
        <Cartao titulo={`OS atrasadas (${a.osAtrasadas.length})`} icone={AlertTriangle}>
          {a.osAtrasadas.slice(0, 8).map((o) => (
            <LinhaOS
              key={o.id}
              o={o}
              extra={<span className="text-xs font-bold text-vermelho whitespace-nowrap">previsão {o.dataPrevista ? relativo(o.dataPrevista) : '—'}</span>}
            />
          ))}
        </Cartao>
      )}

      {a.fiadoEmAtraso && a.fiadoEmAtraso.length > 0 && (
        <Cartao
          titulo={`Fiado em atraso (${a.fiadoEmAtraso.length})`}
          icone={HandCoins}
          acao={<Link to="/contas-receber" className="text-xs font-bold text-laranja hover:underline">Contas a receber</Link>}
        >
          {a.fiadoEmAtraso.slice(0, 6).map((f) => (
            <div key={f.cliente.id} className={linha}>
              <span className="flex-1 min-w-0 truncate">
                <strong>{f.cliente.nome}</strong>{' '}
                <span className="text-grafite/50">
                  · {f.parcelas} parcela(s), {f.diasAtraso} dia(s) de atraso
                </span>
              </span>
              <span className="font-bold tabular-nums text-vermelho">{brl(f.valor)}</span>
              <BtnWhatsApp
                compacto
                href={linkWhatsApp(
                  f.cliente.whatsapp ?? f.cliente.telefone,
                  `Olá, ${f.cliente.nome.split(' ')[0]}! Aqui é da ${oficina.nome}. Passando para lembrar do valor de ${brl(f.valor)} que está em aberto conosco. Qualquer coisa é só chamar!`,
                )}
              >
                Cobrar
              </BtnWhatsApp>
            </div>
          ))}
        </Cartao>
      )}

      {a.orcamentosVencendo && a.orcamentosVencendo.length > 0 && (
        <Cartao titulo={`Orçamentos vencendo (${a.orcamentosVencendo.length})`} icone={FileClock}>
          {a.orcamentosVencendo.slice(0, 6).map((o) => (
            <Link key={o.id} to={`/orcamentos?abrir=${o.id}`} className={`${linha} hover:bg-fundo/50`}>
              <span className="font-mono font-bold text-grafite/40 text-xs w-10 shrink-0">#{o.numero}</span>
              <span className="flex-1 min-w-0 truncate">
                <strong>{o.cliente?.nome ?? o.contatoNome ?? 'Sem nome'}</strong>
                {o.carro && <span className="text-grafite/50"> · {o.carro.modelo}</span>}
              </span>
              <span className="font-bold tabular-nums">{brl(o.total)}</span>
              <span className="text-xs font-bold text-amarelo whitespace-nowrap">{o.diasRestantes <= 0 ? 'vence hoje' : `${o.diasRestantes} dia(s)`}</span>
            </Link>
          ))}
        </Cartao>
      )}

      {a.revisaoVencida && a.revisaoVencida.length > 0 && (
        <Cartao titulo={`Chamar para revisão (${a.revisaoVencida.length})`} icone={Phone}>
          {a.revisaoVencida.slice(0, 6).map((r) => (
            <div key={r.carroId} className={linha}>
              <Placa placa={r.placa} />
              <span className="flex-1 min-w-0 truncate">
                <strong>{r.modelo}</strong>{' '}
                <span className="text-grafite/50">
                  · {r.cliente.nome} · última visita {dataBR(r.ultimaOS.data)}
                </span>
              </span>
              <BtnWhatsApp compacto href={linkWhatsApp(r.cliente.whatsapp ?? r.cliente.telefone, mensagens.retorno(r, oficina))}>
                Chamar
              </BtnWhatsApp>
            </div>
          ))}
        </Cartao>
      )}

      {a.estoqueBaixo.length > 0 && (
        <Cartao
          titulo={`Estoque baixo (${a.estoqueBaixo.length})`}
          icone={PackageMinus}
          acao={<Link to="/estoque?baixo=1" className="text-xs font-bold text-laranja hover:underline">Ver estoque</Link>}
        >
          {a.estoqueBaixo.slice(0, 8).map((p) => (
            <div key={p.id} className={linha}>
              <span className="flex-1 min-w-0 truncate font-semibold">{p.nome}</span>
              {p.localizacao && <span className="text-xs text-grafite/40">prat. {p.localizacao}</span>}
              <span className={`tabular-nums font-bold ${p.estoqueAtual <= 0 ? 'text-vermelho' : 'text-amarelo'}`}>
                {formatarQtd(p.estoqueAtual, p.unidade)}
              </span>
              <span className="text-xs text-grafite/40 w-20 text-right">mín. {formatarQtd(p.estoqueMinimo)}</span>
            </div>
          ))}
        </Cartao>
      )}

      {a.comprasVencendo && a.comprasVencendo.length > 0 && (
        <Cartao
          titulo={`Boletos de distribuidor (${a.comprasVencendo.length})`}
          icone={Truck}
          acao={<Link to="/compras" className="text-xs font-bold text-laranja hover:underline">Compras</Link>}
        >
          {a.comprasVencendo.map((c) => (
            <div key={c.id} className={linha}>
              <span className="flex-1 min-w-0 truncate">
                <strong>{c.fornecedor}</strong> <span className="text-grafite/50">· compra #{c.numero}</span>
              </span>
              <span className="font-bold tabular-nums">{brl(c.valorTotal)}</span>
              <span className={`text-xs font-bold whitespace-nowrap ${c.diasParaVencer < 0 ? 'text-vermelho' : 'text-amarelo'}`}>
                {c.diasParaVencer < 0 ? `venceu ${relativo(c.vencimento)}` : c.diasParaVencer === 0 ? 'vence hoje' : `vence ${relativo(c.vencimento)}`}
              </span>
            </div>
          ))}
        </Cartao>
      )}
    </div>
  );
}

function AgendaDeHoje({ visitas, carregando }: { visitas: VisitaDTO[]; carregando: boolean }) {
  const oficina = useOficina();
  const { pode } = useSessao();
  return (
    <Cartao titulo="Agenda de hoje" icone={CalendarDays} acao={<Link to="/agenda" className="text-xs font-bold text-laranja hover:underline">Abrir agenda</Link>}>
      {carregando && <div className="px-4 py-6 text-center text-sm text-grafite/40">Carregando...</div>}
      {!carregando && visitas.length === 0 && <div className="px-4 py-8 text-center text-sm text-grafite/40">Nenhum horário marcado para hoje.</div>}
      {visitas.map((v) => (
        <div key={v.id} className={linha}>
          <span className="font-extrabold tabular-nums text-petroleo w-12 shrink-0">{horaBR(v.dataHora)}</span>
          <span className="flex-1 min-w-0">
            <span className="block truncate font-bold">{v.cliente.nome}</span>
            <span className="block text-xs text-grafite/50 truncate">
              {LABEL_TIPO_VISITA[v.tipo]}
              {v.carro && ` · ${v.carro.modelo}`}
            </span>
          </span>
          <Badge cor={CORES_STATUS_VISITA[v.status]}>{LABEL_STATUS_VISITA[v.status]}</Badge>
          {pode('atender') && (
            <BtnWhatsApp compacto href={linkWhatsApp(v.cliente.whatsapp ?? v.cliente.telefone, mensagens.lembreteVisita(v, oficina))}>
              Lembrar
            </BtnWhatsApp>
          )}
        </div>
      ))}
    </Cartao>
  );
}
