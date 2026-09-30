import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Hourglass,
  KeyRound,
  PackageSearch,
  Pencil,
  Play,
  Printer,
  RotateCcw,
  ShieldCheck,
  Undo2,
  UserCheck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import {
  LABEL_FORMA_PAGAMENTO,
  STATUS_DO_MECANICO,
  TRANSICOES_OS,
  brl,
  type OrdemServicoDTO,
  type SituacaoGarantiaDTO,
  type StatusOS,
  type UsuarioSessao,
} from '@hermes/shared';
import { http } from '../../api/http';
import { useEquipe, useOficina } from '../../api/catalogo';
import { useAvisos } from '../../lib/avisos';
import {
  CORES_STATUS_OS,
  CORES_STATUS_PARCELA,
  LABEL_STATUS_OS,
  LABEL_STATUS_PARCELA,
  dataBR,
  dataHoraBR,
  formatarTelefone,
  relativo,
} from '../../lib/format';
import { linkWhatsApp, mensagens } from '../../lib/whatsapp';
import { useSessao } from '../acesso/sessao';
import {
  AreaTexto,
  Badge,
  BtnGhost,
  BtnPrimary,
  BtnWhatsApp,
  DinheiroNoLugar,
  ErroAoCarregar,
  InfoLinha,
  MenuMais,
  Modal,
  Placa,
  Secao,
  Selecao,
} from '../../components/ui';
import { JanelaMotivo } from '../../components/JanelaMotivo';
import { DocumentoImpressao, OSDoc } from '../../components/Impressao';
import { DINHEIRO, useAcaoNaOS, useOS, type AcaoNaOS } from './api';
import { ItensDaOS } from './ItensDaOS';
import { ReceberOS } from './ReceberOS';
import { FormEntradaOS } from './FormEntradaOS';
import { AbrirGarantia } from './AbrirGarantia';

// ============================================================
// A OS aberta na tela: é aqui que o dia da oficina acontece.
// Lançar peça, apontar serviço feito, concluir, receber, entregar —
// tudo sem sair da janela, e cada botão só aparece para quem pode
// (e quando pode) usá-lo.
// ============================================================

type Janela = 'receber' | 'cancelar' | 'estornar' | 'garantia' | 'imprimir' | 'entrada' | null;

const ENCERRADAS: StatusOS[] = ['ENTREGUE', 'CANCELADA'];

export function DetalheOS({ id, onFechar, onAbrir }: { id: string; onFechar: () => void; onAbrir: (id: string) => void }) {
  const { usuario } = useSessao();
  const consulta = useOS(id);
  const acao = useAcaoNaOS(id);
  const [janela, setJanela] = useState<Janela>(null);
  const os = consulta.data;

  return (
    <>
      <Modal
        title={
          os ? (
            <span className="flex items-center gap-2 flex-wrap">
              OS #{os.numero}
              <Badge cor={CORES_STATUS_OS[os.status]}>{LABEL_STATUS_OS[os.status]}</Badge>
              {os.garantia && (
                <Badge cor="bg-azul-bg text-azul">
                  <ShieldCheck size={12} /> Garantia
                </Badge>
              )}
              {os.atrasada && (
                <Badge cor="bg-vermelho-bg text-vermelho">
                  <AlertTriangle size={12} /> Atrasada
                </Badge>
              )}
            </span>
          ) : (
            'Ordem de Serviço'
          )
        }
        size="xl"
        onClose={onFechar}
        semConfirmarDescarte
        semFocoInicial
        footer={os && usuario ? <Rodape os={os} usuario={usuario} acao={acao} abrir={setJanela} /> : undefined}
      >
        {consulta.isPending ? (
          <div className="text-center text-grafite/40 py-16 text-sm">Carregando...</div>
        ) : consulta.error || !os || !usuario ? (
          <ErroAoCarregar erro={consulta.error} onTentar={() => void consulta.refetch()} />
        ) : (
          <Corpo os={os} usuario={usuario} acao={acao} abrir={setJanela} onAbrir={onAbrir} />
        )}
      </Modal>

      {os && janela === 'receber' && <ReceberOS os={os} executar={acao.executar} onFechar={() => setJanela(null)} />}
      {os && janela === 'entrada' && <FormEntradaOS os={os} executar={acao.executar} onFechar={() => setJanela(null)} />}
      {os && janela === 'garantia' && (
        <AbrirGarantia
          os={os}
          onFechar={() => setJanela(null)}
          onAberta={(nova) => {
            setJanela(null);
            onAbrir(nova);
          }}
        />
      )}
      {os && janela === 'imprimir' && (
        <DocumentoImpressao onFechar={() => setJanela(null)}>
          <OSDoc os={os} />
        </DocumentoImpressao>
      )}
      {os && janela === 'cancelar' && (
        <JanelaMotivo
          titulo={`Cancelar a OS #${os.numero}`}
          botao="Cancelar a OS"
          sugestoes={['Cliente desistiu do serviço', 'Orçamento não aprovado', 'Aberta por engano']}
          onFechar={() => setJanela(null)}
          onConfirmar={async (motivo) => {
            const r = await acao.executar(() => http.post<OrdemServicoDTO>(`/ordens/${os.id}/cancelar`, { motivo }), {
              sucesso: os.pecas.length ? 'OS cancelada. As peças voltaram para o estoque.' : 'OS cancelada.',
            });
            if (r) setJanela(null);
          }}
        >
          {os.pecas.length > 0 && 'As peças lançadas voltam para o estoque. '}A OS continua no histórico, marcada como cancelada.
        </JanelaMotivo>
      )}
      {os && janela === 'estornar' && (
        <JanelaMotivo
          titulo={`Estornar o pagamento da OS #${os.numero}`}
          botao="Estornar"
          sugestoes={['Forma de pagamento lançada errada', 'Valor lançado errado', 'Cliente devolveu o serviço']}
          onFechar={() => setJanela(null)}
          onConfirmar={async (motivo) => {
            const r = await acao.executar(() => http.post<OrdemServicoDTO>(`/ordens/${os.id}/estornar-pagamento`, { motivo }), {
              invalidar: DINHEIRO,
              sucesso: 'Pagamento estornado. A OS voltou para "Concluída".',
            });
            if (r) setJanela(null);
          }}
        >
          {os.recebido > 0 && (
            <>
              <strong>{brl(os.recebido)}</strong> que entraram por esta OS saem do caixa como estorno.{' '}
            </>
          )}
          {os.aReceber > 0 && 'As parcelas em aberto são canceladas. '}A OS volta para "Concluída", esperando o pagamento certo. Nada é
          apagado: o estorno fica no caixa e no histórico.
        </JanelaMotivo>
      )}
    </>
  );
}

interface PropsParte {
  os: OrdemServicoDTO;
  usuario: UsuarioSessao;
  acao: ReturnType<typeof useAcaoNaOS>;
  abrir: (j: Janela) => void;
}

// ---- Corpo -------------------------------------------------------------------

function Corpo({ os, usuario, acao, abrir, onAbrir }: PropsParte & { onAbrir: (id: string) => void }) {
  const navegar = useNavigate();
  const oficina = useOficina();
  const p = usuario.permissoes;
  const minha = os.mecanico?.id === usuario.id;
  const encerrada = ENCERRADAS.includes(os.status);
  const valoresAbertos = !encerrada && !os.formaPagamento;
  const telefone = os.cliente.whatsapp ?? os.cliente.telefone;

  return (
    <div className="space-y-4">
      {os.status === 'CANCELADA' && (
        <Aviso cor="vermelho" icone={Ban}>
          Cancelada {os.canceladaEm ? `em ${dataHoraBR(os.canceladaEm)}` : ''}
          {os.motivoCancelamento && <span className="font-normal"> — {os.motivoCancelamento}</span>}
        </Aviso>
      )}
      {os.garantia && os.osOrigem && (
        <Aviso cor="azul" icone={ShieldCheck}>
          Retorno em garantia da{' '}
          <button type="button" onClick={() => onAbrir(os.osOrigem!.id)} className="underline">
            OS #{os.osOrigem.numero}
          </button>
          <span className="font-normal"> — a mão de obra não é cobrada; peça nova entra normalmente.</span>
        </Aviso>
      )}
      {os.status === 'CONCLUIDA' && (
        <Aviso cor="verde" icone={CheckCircle2}>
          Serviço concluído{os.dataConclusao ? ` ${relativo(os.dataConclusao)}` : ''}. Avise o cliente que o carro está pronto.
          <span className="ml-auto">
            <BtnWhatsApp href={linkWhatsApp(telefone, mensagens.osPronta(os, oficina))} compacto>
              Avisar no WhatsApp
            </BtnWhatsApp>
          </span>
        </Aviso>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        <div className="bg-fundo rounded-xl p-3.5">
          <div className="text-[11px] font-bold text-grafite/40 uppercase tracking-wide">Cliente</div>
          <div className="flex items-center gap-2 mt-0.5">
            {p.cadastrarClientes ? (
              <button type="button" onClick={() => navegar(`/clientes?abrir=${os.cliente.id}`)} className="font-extrabold text-petroleo hover:underline text-left">
                {os.cliente.nome}
              </button>
            ) : (
              <span className="font-extrabold text-petroleo">{os.cliente.nome}</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-grafite/60 mt-0.5">
            {telefone ? formatarTelefone(telefone) : 'sem telefone'}
            <BtnWhatsApp href={linkWhatsApp(telefone, `Olá, ${os.cliente.nome.split(' ')[0]}! Aqui é da oficina, sobre o seu ${os.carro.modelo}.`)} compacto />
          </div>
        </div>
        <div className="bg-fundo rounded-xl p-3.5">
          <div className="text-[11px] font-bold text-grafite/40 uppercase tracking-wide">Veículo</div>
          <div className="flex items-center gap-2 mt-0.5">
            <Placa placa={os.carro.placa} />
            <span className="font-extrabold text-petroleo">
              {os.carro.marca} {os.carro.modelo}
            </span>
          </div>
          <div className="text-sm text-grafite/60 mt-0.5">
            {[os.carro.ano, os.carro.cor, os.kmEntrada != null ? `entrou com ${os.kmEntrada.toLocaleString('pt-BR')} km` : null]
              .filter(Boolean)
              .join(' · ') || '—'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <InfoLinha rotulo="Abertura" valor={dataHoraBR(os.dataAbertura)} />
        <InfoLinha
          rotulo="Previsão"
          valor={
            os.dataPrevista ? <span className={os.atrasada ? 'text-vermelho' : ''}>{dataHoraBR(os.dataPrevista)}</span> : 'sem previsão'
          }
        />
        <InfoLinha rotulo={os.dataEntrega ? 'Entregue' : 'Concluída'} valor={os.dataEntrega ? dataHoraBR(os.dataEntrega) : os.dataConclusao ? dataHoraBR(os.dataConclusao) : '—'} />
        <Mecanico os={os} usuario={usuario} executar={acao.executar} ocupado={acao.ocupado} />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <TextoDaOS
          rotulo="Queixa do cliente"
          valor={os.defeitoRelatado}
          vazio="O que o cliente contou quando deixou o carro."
          podeEditar={p.atender && os.status !== 'CANCELADA'}
          acaoExtra={
            p.atender && !encerrada ? (
              <button type="button" onClick={() => abrir('entrada')} className="text-xs font-bold text-laranja hover:underline inline-flex items-center gap-1">
                <Pencil size={11} /> KM e previsão
              </button>
            ) : undefined
          }
          onSalvar={(v) => acao.executar(() => http.patch<OrdemServicoDTO>(`/ordens/${os.id}`, { defeitoRelatado: v, versao: os.versao }))}
        />
        <TextoDaOS
          rotulo="Laudo / diagnóstico"
          valor={os.observacoes}
          vazio="O que o mecânico encontrou e fez."
          podeEditar={(p.atender || minha) && os.status !== 'CANCELADA'}
          // A versão vai junto: texto livre é onde um salvaria por cima do outro (ADR 0010).
          onSalvar={(v) => acao.executar(() => http.patch<OrdemServicoDTO>(`/ordens/${os.id}`, { observacoes: v, versao: os.versao }))}
        />
      </div>

      <ItensDaOS os={os} usuario={usuario} executar={acao.executar} ocupado={acao.ocupado} />

      <div className="flex flex-col items-end gap-1 text-sm">
        <div className="flex items-center gap-3">
          <span className="text-grafite/55">Subtotal</span>
          <span className="w-32 text-right tabular-nums font-semibold">{brl(os.subtotal)}</span>
        </div>
        {(os.desconto > 0 || (valoresAbertos && p.darDesconto && !os.garantia)) && (
          <div className="flex items-center gap-3">
            <span className="text-grafite/55">Desconto</span>
            <DinheiroNoLugar
              valor={os.desconto}
              prefixo={os.desconto > 0 ? '−' : ''}
              className="w-32"
              titulo="Dar desconto"
              editavel={valoresAbertos && p.darDesconto && !os.garantia && !acao.ocupado}
              onSalvar={(v) =>
                acao.executar((x) => http.patch<OrdemServicoDTO>(`/ordens/${os.id}`, { desconto: v, ...x }), {
                  sucesso: v > 0 ? `Desconto de ${brl(v)} aplicado.` : 'Desconto removido.',
                })
              }
            />
          </div>
        )}
        <div className="flex items-center gap-3 mt-1">
          <span className="font-bold text-petroleo">Total</span>
          <span className="w-32 text-right tabular-nums text-2xl font-extrabold text-petroleo">{brl(os.total)}</span>
        </div>
      </div>

      {p.receberPagamentos && (os.formaPagamento || os.pagamentos.length > 0) && <Pagamento os={os} />}

      <Vinculos os={os} usuario={usuario} onAbrir={onAbrir} />
    </div>
  );
}

function Aviso({ cor, icone: Icone, children }: { cor: 'verde' | 'azul' | 'vermelho' | 'amarelo'; icone: LucideIcon; children: ReactNode }) {
  const cores = {
    verde: 'bg-verde-bg text-verde',
    azul: 'bg-azul-bg text-azul',
    vermelho: 'bg-vermelho-bg text-vermelho',
    amarelo: 'bg-amarelo-bg text-amarelo',
  }[cor];
  return (
    <div className={`flex items-center gap-2 flex-wrap rounded-xl px-3.5 py-2.5 text-sm font-bold ${cores}`}>
      <Icone size={17} className="shrink-0" />
      {children}
    </div>
  );
}

function Mecanico({ os, usuario, executar, ocupado }: { os: OrdemServicoDTO; usuario: UsuarioSessao; executar: AcaoNaOS; ocupado: boolean }) {
  const equipe = useEquipe('MECANICO');
  const encerrada = ENCERRADAS.includes(os.status);

  if (usuario.permissoes.atender && !encerrada) {
    const lista = equipe.data ?? [];
    const foraDaLista = os.mecanico && !lista.some((m) => m.id === os.mecanico!.id);
    return (
      <label className="min-w-0">
        <span className="block text-[11px] font-bold text-grafite/40 uppercase tracking-wide">Mecânico</span>
        <Selecao
          value={os.mecanico?.id ?? ''}
          disabled={ocupado}
          onChange={(e) =>
            void executar(() => http.patch<OrdemServicoDTO>(`/ordens/${os.id}/mecanico`, { mecanicoId: e.target.value || null }), {
              sucesso: e.target.value ? 'Mecânico definido.' : 'OS sem mecânico.',
            })
          }
          className="!py-1.5 !px-2 text-sm font-semibold"
        >
          <option value="">— ninguém ainda —</option>
          {foraDaLista && <option value={os.mecanico!.id}>{os.mecanico!.nome}</option>}
          {lista.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </Selecao>
      </label>
    );
  }

  if (!os.mecanico && !encerrada && usuario.perfil === 'MECANICO') {
    return (
      <div className="min-w-0">
        <div className="text-[11px] font-bold text-grafite/40 uppercase tracking-wide">Mecânico</div>
        <button
          type="button"
          disabled={ocupado}
          onClick={() => void executar(() => http.post<OrdemServicoDTO>(`/ordens/${os.id}/assumir`), { sucesso: 'A OS agora é sua.' })}
          className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-bold text-laranja hover:underline"
        >
          <UserCheck size={15} /> Assumir esta OS
        </button>
      </div>
    );
  }

  return <InfoLinha rotulo="Mecânico" valor={os.mecanico?.nome ?? 'ninguém ainda'} />;
}

/** Texto livre da OS (queixa, laudo): lê como texto, edita num clique. */
function TextoDaOS({
  rotulo,
  valor,
  vazio,
  podeEditar,
  acaoExtra,
  onSalvar,
}: {
  rotulo: string;
  valor: string | null;
  vazio: string;
  podeEditar: boolean;
  acaoExtra?: ReactNode;
  onSalvar: (v: string) => Promise<unknown>;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (texto === null) return;
    setSalvando(true);
    const ok = await onSalvar(texto.trim());
    setSalvando(false);
    if (ok) setTexto(null);
  }

  return (
    <Secao
      titulo={rotulo}
      acao={
        <span className="flex items-center gap-3">
          {acaoExtra}
          {podeEditar && texto === null && (
            <button type="button" onClick={() => setTexto(valor ?? '')} className="text-xs font-bold text-laranja hover:underline inline-flex items-center gap-1">
              <Pencil size={11} /> {valor ? 'Editar' : 'Escrever'}
            </button>
          )}
        </span>
      }
    >
      {texto === null ? (
        <div className={`text-sm whitespace-pre-wrap rounded-lg border border-linha px-3 py-2 min-h-[3.25rem] ${valor ? '' : 'text-grafite/40'}`}>
          {valor || vazio}
        </div>
      ) : (
        <div className="space-y-2" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setTexto(null))}>
          <AreaTexto value={texto} autoFocus maxLength={4000} onChange={(e) => setTexto(e.target.value)} />
          <div className="flex justify-end gap-2">
            <BtnGhost onClick={() => setTexto(null)} className="!py-1.5 !px-3 text-sm">
              Cancelar
            </BtnGhost>
            <BtnPrimary onClick={() => void salvar()} disabled={salvando} className="!py-1.5 !px-3 text-sm">
              {salvando ? 'Salvando...' : 'Salvar'}
            </BtnPrimary>
          </div>
        </div>
      )}
    </Secao>
  );
}

function Pagamento({ os }: { os: OrdemServicoDTO }) {
  return (
    <Secao titulo="Pagamento">
      <div className="border border-linha rounded-xl overflow-hidden">
        <div className="flex items-center gap-x-5 gap-y-1 flex-wrap px-3.5 py-2.5 bg-fundo text-sm">
          <span>
            Forma: <strong>{os.formaPagamento ? LABEL_FORMA_PAGAMENTO[os.formaPagamento] : '—'}</strong>
          </span>
          <span>
            Recebido: <strong className="text-verde tabular-nums">{brl(os.recebido)}</strong>
          </span>
          {os.aReceber > 0 && (
            <span>
              A receber: <strong className="text-amarelo tabular-nums">{brl(os.aReceber)}</strong>
            </span>
          )}
        </div>
        {os.pagamentos.map((pg) => (
          <div key={pg.id} className="flex items-center gap-3 px-3.5 py-2 border-t border-linha text-sm">
            <span className="text-grafite/50 tabular-nums w-28 shrink-0">{dataHoraBR(pg.data)}</span>
            <span className="flex-1 min-w-0 truncate">{pg.descricao}</span>
            {pg.forma && <span className="text-grafite/50 text-xs">{LABEL_FORMA_PAGAMENTO[pg.forma]}</span>}
            <span className={`w-28 text-right font-bold tabular-nums ${pg.tipo === 'SAIDA' ? 'text-vermelho' : 'text-verde'}`}>
              {pg.tipo === 'SAIDA' ? '−' : '+'}
              {brl(pg.valor)}
            </span>
          </div>
        ))}
        {os.parcelas.map((pc) => (
          <div key={pc.id} className="flex items-center gap-3 px-3.5 py-2 border-t border-linha text-sm">
            <span className="text-grafite/50 w-28 shrink-0">
              Parcela {pc.parcela}/{pc.totalParcelas}
            </span>
            <span className="flex-1 min-w-0 truncate">
              vence {dataBR(pc.vencimento)}
              {pc.valorPago > 0 && pc.status === 'PENDENTE' && <span className="text-grafite/50"> · pago {brl(pc.valorPago)}</span>}
            </span>
            <Badge cor={pc.emAtraso ? 'bg-vermelho-bg text-vermelho' : CORES_STATUS_PARCELA[pc.status]}>
              {pc.emAtraso ? 'Em atraso' : LABEL_STATUS_PARCELA[pc.status]}
            </Badge>
            <span className="w-28 text-right font-bold tabular-nums">{brl(pc.status === 'PENDENTE' ? pc.saldo : pc.valor)}</span>
          </div>
        ))}
      </div>
    </Secao>
  );
}

/** De onde a OS veio e o que saiu dela (orçamento, garantias). */
function Vinculos({ os, usuario, onAbrir }: { os: OrdemServicoDTO; usuario: UsuarioSessao; onAbrir: (id: string) => void }) {
  const navegar = useNavigate();
  if (!os.orcamento && os.garantias.length === 0) return null;
  return (
    <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-sm text-grafite/60">
      {os.orcamento &&
        (usuario.permissoes.atender ? (
          <button type="button" onClick={() => navegar(`/orcamentos?abrir=${os.orcamento!.id}`)} className="hover:underline">
            Veio do orçamento <strong>#{os.orcamento.numero}</strong>
          </button>
        ) : (
          <span>
            Veio do orçamento <strong>#{os.orcamento.numero}</strong>
          </span>
        ))}
      {os.garantias.length > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck size={14} className="text-azul" /> Retornos em garantia:
          {os.garantias.map((g) => (
            <button key={g.id} type="button" onClick={() => onAbrir(g.id)} className="font-bold hover:underline">
              #{g.numero}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

// ---- Rodapé: o próximo passo ------------------------------------------------

interface Passo {
  rotulo: string;
  icone: LucideIcon;
  primario?: boolean;
  onClick: () => void;
}

function Rodape({ os, usuario, acao, abrir }: PropsParte) {
  const avisos = useAvisos();
  const p = usuario.permissoes;
  const minha = os.mecanico?.id === usuario.id;
  const encerrada = ENCERRADAS.includes(os.status);
  const garantia = useQuery({
    queryKey: ['ordens', os.id, 'garantia'],
    queryFn: () => http.get<SituacaoGarantiaDTO>(`/ordens/${os.id}/garantia`),
    enabled: p.atender && !os.garantia && (os.status === 'CONCLUIDA' || os.status === 'ENTREGUE'),
  });

  const mudar = (status: StatusOS, sucesso?: string) =>
    void acao.executar(() => http.patch<OrdemServicoDTO>(`/ordens/${os.id}/status`, { status }), { sucesso });

  async function concluir() {
    const pendentes = os.servicos.filter((s) => !s.concluido).length;
    if (pendentes > 0) {
      const ok = await avisos.confirmar({
        titulo: 'Concluir a OS?',
        mensagem: `${pendentes} serviço(s) não foram marcados como feitos. Concluir mesmo assim?`,
        botao: 'Concluir',
      });
      if (!ok) return;
    }
    mudar('CONCLUIDA', 'Serviço concluído. Avise o cliente que o carro está pronto.');
  }

  // Os passos possíveis a partir daqui (a mesma tabela que o servidor usa).
  const passos: Passo[] = [];
  const mexeNoFluxo = p.atender || minha;
  if (mexeNoFluxo) {
    for (const destino of TRANSICOES_OS[os.status]) {
      if (!p.atender && !STATUS_DO_MECANICO.includes(destino)) continue;
      if (destino === 'EM_EXECUCAO') {
        if (os.status === 'CONCLUIDA') {
          if (!os.formaPagamento) passos.push({ rotulo: 'Reabrir', icone: RotateCcw, onClick: () => mudar('EM_EXECUCAO', 'OS reaberta.') });
        } else {
          passos.push({
            rotulo: os.status === 'ABERTA' ? 'Iniciar serviço' : 'Retomar serviço',
            icone: Play,
            primario: true,
            onClick: () => mudar('EM_EXECUCAO'),
          });
        }
      } else if (destino === 'AGUARDANDO_PECA') {
        passos.push({ rotulo: 'Aguardando peça', icone: PackageSearch, onClick: () => mudar('AGUARDANDO_PECA') });
      } else if (destino === 'AGUARDANDO_APROVACAO') {
        passos.push({ rotulo: 'Aguardando o cliente', icone: Hourglass, onClick: () => mudar('AGUARDANDO_APROVACAO') });
      } else if (destino === 'CONCLUIDA') {
        passos.push({ rotulo: 'Concluir serviço', icone: CheckCircle2, primario: true, onClick: () => void concluir() });
      } else if (destino === 'ENTREGUE') {
        const falta = !os.formaPagamento && os.total > 0;
        if (!falta) passos.push({ rotulo: 'Entregar o carro', icone: KeyRound, primario: true, onClick: () => mudar('ENTREGUE', 'Carro entregue.') });
      }
    }
  }
  // Receber: concluída (ou entregue sem pagamento, de antes da v1) e com valor.
  if (p.receberPagamentos && !os.formaPagamento && os.total > 0 && (os.status === 'CONCLUIDA' || os.status === 'ENTREGUE')) {
    passos.push({ rotulo: 'Receber pagamento', icone: Wallet, primario: true, onClick: () => abrir('receber') });
  }

  const secundarios = passos.filter((x) => !x.primario);
  const principais = passos.filter((x) => x.primario);

  return (
    <>
      <div className="flex flex-wrap gap-2 mr-auto">
        <BtnGhost icone={Printer} onClick={() => abrir('imprimir')} titulo="Imprimir a OS (ou salvar em PDF)">
          Imprimir
        </BtnGhost>
        <MenuMais
          itens={[
            {
              rotulo: `Abrir garantia${garantia.data ? ` (até ${dataBR(garantia.data.garantiaAte)})` : ''}`,
              icone: ShieldCheck,
              onClick: () => abrir('garantia'),
              visivel: !!garantia.data?.elegivel,
            },
            { rotulo: 'Estornar pagamento', icone: Undo2, perigo: true, onClick: () => abrir('estornar'), visivel: p.apagarRegistros && !!os.formaPagamento },
            { rotulo: 'Cancelar OS', icone: Ban, perigo: true, onClick: () => abrir('cancelar'), visivel: p.atender && !encerrada && !os.formaPagamento },
          ]}
        />
      </div>
      {secundarios.map((x) => (
        <BtnGhost key={x.rotulo} icone={x.icone} onClick={x.onClick} disabled={acao.ocupado}>
          {x.rotulo}
        </BtnGhost>
      ))}
      {principais.map((x) => (
        <BtnPrimary key={x.rotulo} icone={x.icone} onClick={x.onClick} disabled={acao.ocupado}>
          {x.rotulo}
        </BtnPrimary>
      ))}
    </>
  );
}
