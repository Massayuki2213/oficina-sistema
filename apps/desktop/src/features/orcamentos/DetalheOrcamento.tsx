import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, CheckCircle2, ClipboardList, Copy, FileClock, Link2, Pencil, Printer, Send, Trash2, Undo2, Zap } from 'lucide-react';
import { brl, formatarQtd, type AprovacaoDTO, type OrcamentoDTO, type StatusOrcamento } from '@hermes/shared';
import { http, mensagemDeErro } from '../../api/http';
import { useOficina } from '../../api/catalogo';
import { useAvisos } from '../../lib/avisos';
import { CORES_STATUS_ORCAMENTO, LABEL_STATUS_ORCAMENTO, dataBR, formatarTelefone, relativo } from '../../lib/format';
import { linkWhatsApp, mensagens } from '../../lib/whatsapp';
import { useSessao } from '../acesso/sessao';
import { Badge, BtnGhost, BtnPrimary, BtnWhatsApp, ErroAoCarregar, MenuMais, Modal, Placa, Secao } from '../../components/ui';
import { DocumentoImpressao, OrcamentoDoc } from '../../components/Impressao';
import { FormOrcamento } from './FormOrcamento';
import { AprovarOrcamento, IdentificarOrcamento } from './AprovarOrcamento';

type Janela = 'editar' | 'aprovar' | 'identificar' | 'imprimir' | null;

export const chaveOrcamento = (id: string) => ['orcamentos', id] as const;

/** Pode virar OS: em aberto e dentro da validade. */
export const aprovavel = (o: { status: StatusOrcamento }) => o.status === 'RASCUNHO' || o.status === 'ENVIADO';

export function DetalheOrcamento({ id, onFechar, onAbrir }: { id: string; onFechar: () => void; onAbrir: (id: string) => void }) {
  const navegar = useNavigate();
  const qc = useQueryClient();
  const avisos = useAvisos();
  const oficina = useOficina();
  const { pode } = useSessao();
  const consulta = useQuery({ queryKey: chaveOrcamento(id), queryFn: () => http.get<OrcamentoDTO>(`/orcamentos/${id}`) });
  const [janela, setJanela] = useState<Janela>(null);
  const [ocupado, setOcupado] = useState(false);
  const o = consulta.data;

  async function fazer(acao: () => Promise<OrcamentoDTO>, sucesso?: string) {
    setOcupado(true);
    try {
      const r = await acao();
      if (r) qc.setQueryData(chaveOrcamento(id), r);
      await qc.invalidateQueries({ queryKey: ['orcamentos'] });
      if (sucesso) avisos.sucesso(sucesso);
      return r;
    } catch (e) {
      avisos.erro(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  }

  const mudarStatus = (status: 'RASCUNHO' | 'ENVIADO' | 'RECUSADO', sucesso?: string) =>
    fazer(() => http.patch<OrcamentoDTO>(`/orcamentos/${id}/status`, { status }), sucesso);

  async function duplicar() {
    const novo = await fazer(() => http.post<OrcamentoDTO>(`/orcamentos/${id}/duplicar`), 'Orçamento refeito com os preços de hoje.');
    if (novo) onAbrir(novo.id);
  }

  async function excluir() {
    if (!o) return;
    const ok = await avisos.confirmar({
      titulo: `Excluir o orçamento #${o.numero}`,
      mensagem: `O orçamento de ${o.cliente?.nome ?? o.contatoNome ?? 'contato sem nome'} (${brl(o.total)}) será apagado.`,
      botao: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    setOcupado(true);
    try {
      await http.delete(`/orcamentos/${id}`);
      onFechar();
      qc.removeQueries({ queryKey: chaveOrcamento(id) });
      await qc.invalidateQueries({ queryKey: ['orcamentos'] });
      avisos.sucesso(`Orçamento #${o.numero} excluído.`);
    } catch (e) {
      avisos.erro(mensagemDeErro(e));
      setOcupado(false);
    }
  }

  const telefone = o ? (o.cliente?.whatsapp ?? o.cliente?.telefone ?? o.contatoTelefone) : null;
  const rapido = o && !o.clienteId;

  return (
    <>
      <Modal
        title={
          o ? (
            <span className="flex items-center gap-2 flex-wrap">
              Orçamento #{o.numero}
              <Badge cor={CORES_STATUS_ORCAMENTO[o.status]}>{LABEL_STATUS_ORCAMENTO[o.status]}</Badge>
              {rapido && (
                <Badge cor="bg-azul-bg text-azul">
                  <Zap size={12} /> Rápido
                </Badge>
              )}
            </span>
          ) : (
            'Orçamento'
          )
        }
        size="xl"
        onClose={onFechar}
        semConfirmarDescarte
        semFocoInicial
        footer={
          o && (
            <>
              <div className="flex flex-wrap gap-2 mr-auto">
                <BtnGhost icone={Printer} onClick={() => setJanela('imprimir')} titulo="Imprimir ou salvar em PDF">
                  Imprimir
                </BtnGhost>
                <MenuMais
                  itens={[
                    { rotulo: 'Refazer com os preços de hoje', icone: Copy, onClick: () => void duplicar() },
                    { rotulo: 'Marcar como enviado', icone: Send, onClick: () => void mudarStatus('ENVIADO', 'Marcado como enviado.'), visivel: o.status === 'RASCUNHO' },
                    { rotulo: 'Voltar para rascunho', icone: Undo2, onClick: () => void mudarStatus('RASCUNHO'), visivel: o.status === 'ENVIADO' || o.status === 'RECUSADO' },
                    { rotulo: 'Vincular a um cliente', icone: Link2, onClick: () => setJanela('identificar'), visivel: !o.carroId && o.status !== 'APROVADO' },
                    {
                      rotulo: 'Cliente recusou',
                      icone: Ban,
                      perigo: true,
                      onClick: () => void mudarStatus('RECUSADO', 'Orçamento marcado como recusado.'),
                      visivel: o.status === 'RASCUNHO' || o.status === 'ENVIADO' || o.status === 'EXPIRADO',
                    },
                    { rotulo: 'Excluir', icone: Trash2, perigo: true, onClick: () => void excluir(), visivel: pode('apagarRegistros') && !o.os },
                  ]}
                />
              </div>
              {o.status !== 'APROVADO' && (
                <BtnGhost icone={Pencil} onClick={() => setJanela('editar')} disabled={ocupado}>
                  Editar
                </BtnGhost>
              )}
              <BtnWhatsApp
                href={linkWhatsApp(telefone, mensagens.orcamento(o, oficina))}
                onClick={() => {
                  // Mandou pelo WhatsApp: está enviado.
                  if (o.status === 'RASCUNHO') void mudarStatus('ENVIADO');
                }}
              >
                Enviar no WhatsApp
              </BtnWhatsApp>
              {aprovavel(o) && (
                <BtnPrimary icone={ClipboardList} onClick={() => setJanela('aprovar')} disabled={ocupado}>
                  Aprovar e abrir OS
                </BtnPrimary>
              )}
              {o.os && (
                <BtnPrimary icone={ClipboardList} onClick={() => navegar(`/ordens?abrir=${o.os!.id}`)}>
                  Ver a OS #{o.os.numero}
                </BtnPrimary>
              )}
            </>
          )
        }
      >
        {consulta.isPending ? (
          <div className="text-center text-grafite/40 py-16 text-sm">Carregando...</div>
        ) : !o ? (
          <ErroAoCarregar erro={consulta.error} onTentar={() => void consulta.refetch()} />
        ) : (
          <Corpo o={o} onDuplicar={() => void duplicar()} />
        )}
      </Modal>

      {o && janela === 'editar' && (
        <FormOrcamento
          orc={o}
          onFechar={() => setJanela(null)}
          onSalvo={() => setJanela(null)}
        />
      )}
      {o && janela === 'aprovar' && (
        <AprovarOrcamento
          orc={o}
          onFechar={() => setJanela(null)}
          onAprovado={(r: AprovacaoDTO) => {
            setJanela(null);
            onFechar();
            navegar(`/ordens?abrir=${r.os.id}`);
          }}
        />
      )}
      {o && janela === 'identificar' && <IdentificarOrcamento orc={o} onFechar={() => setJanela(null)} onPronto={() => setJanela(null)} />}
      {o && janela === 'imprimir' && (
        <DocumentoImpressao onFechar={() => setJanela(null)}>
          <OrcamentoDoc orc={o} />
        </DocumentoImpressao>
      )}
    </>
  );
}

function Faixa({ cor, icone: Icone, children }: { cor: string; icone: typeof AlertTriangle; children: ReactNode }) {
  return (
    <div className={`flex items-center gap-2 flex-wrap rounded-xl px-3.5 py-2.5 text-sm font-bold ${cor}`}>
      <Icone size={17} className="shrink-0" />
      {children}
    </div>
  );
}

function Corpo({ o, onDuplicar }: { o: OrcamentoDTO; onDuplicar: () => void }) {
  const telefone = o.cliente?.whatsapp ?? o.cliente?.telefone ?? o.contatoTelefone;
  const venceLogo = aprovavel(o) && new Date(o.validade).getTime() - Date.now() < 3 * 86_400_000;

  return (
    <div className="space-y-4">
      {o.status === 'EXPIRADO' && (
        <Faixa cor="bg-amarelo-bg text-amarelo" icone={FileClock}>
          Venceu em {dataBR(o.validade)}. Para aprovar, refaça com os preços de hoje.
          <button type="button" onClick={onDuplicar} className="underline ml-auto">
            Refazer agora
          </button>
        </Faixa>
      )}
      {o.status === 'APROVADO' && o.os && (
        <Faixa cor="bg-verde-bg text-verde" icone={CheckCircle2}>
          Aprovado — virou a OS #{o.os.numero}.
        </Faixa>
      )}
      {o.status === 'RECUSADO' && (
        <Faixa cor="bg-linha text-grafite/60" icone={Ban}>
          O cliente recusou este orçamento.
        </Faixa>
      )}

      <div className="grid md:grid-cols-3 gap-3">
        <div className="bg-fundo rounded-xl p-3.5">
          <div className="text-[11px] font-bold text-grafite/40 uppercase tracking-wide">Cliente</div>
          <div className="font-extrabold text-petroleo mt-0.5">{o.cliente?.nome ?? o.contatoNome ?? 'Sem nome'}</div>
          <div className="text-sm text-grafite/60">{telefone ? formatarTelefone(telefone) : 'sem telefone'}</div>
        </div>
        <div className="bg-fundo rounded-xl p-3.5">
          <div className="text-[11px] font-bold text-grafite/40 uppercase tracking-wide">Veículo</div>
          {o.carro ? (
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <Placa placa={o.carro.placa} />
              <span className="font-extrabold text-petroleo">
                {o.carro.marca} {o.carro.modelo}
              </span>
            </div>
          ) : (
            <div className="font-bold text-grafite/70 mt-0.5">{o.veiculoDescricao ?? 'não informado'}</div>
          )}
          {o.carro?.ano && <div className="text-sm text-grafite/60">{o.carro.ano}</div>}
        </div>
        <div className={`rounded-xl p-3.5 ${venceLogo ? 'bg-amarelo-bg' : 'bg-fundo'}`}>
          <div className="text-[11px] font-bold text-grafite/40 uppercase tracking-wide">Validade</div>
          <div className="font-extrabold text-petroleo mt-0.5">{dataBR(o.validade)}</div>
          <div className={`text-sm ${venceLogo ? 'text-amarelo font-bold' : 'text-grafite/60'}`}>
            {aprovavel(o) ? `vence ${relativo(o.validade)}` : `feito em ${dataBR(o.data)}`}
          </div>
        </div>
      </div>

      <Secao titulo="Itens">
        <div className="border border-linha rounded-xl divide-y divide-linha">
          {o.servicos.map((s) => (
            <Linha key={s.id} nome={s.nome} tipo="Serviço" qtd={`${s.quantidade}×`} unit={s.precoUnit} catalogo={s.precoCatalogo} total={s.subtotal} />
          ))}
          {o.pecas.map((p) => (
            <Linha
              key={p.id}
              nome={p.nome}
              tipo="Peça"
              qtd={formatarQtd(p.quantidade, p.unidade)}
              unit={p.precoUnit}
              catalogo={p.precoCatalogo}
              total={p.subtotal}
              aviso={aprovavel(o) && p.estoqueAtual < p.quantidade ? `só ${formatarQtd(Math.max(0, p.estoqueAtual), p.unidade)} em estoque` : undefined}
            />
          ))}
        </div>
      </Secao>

      <div className="flex flex-col items-end gap-1 text-sm">
        <div className="flex gap-3">
          <span className="text-grafite/55">Subtotal</span>
          <span className="w-32 text-right tabular-nums font-semibold">{brl(o.subtotal)}</span>
        </div>
        {o.desconto > 0 && (
          <div className="flex gap-3">
            <span className="text-grafite/55">Desconto</span>
            <span className="w-32 text-right tabular-nums font-semibold text-vermelho">−{brl(o.desconto)}</span>
          </div>
        )}
        <div className="flex items-center gap-3 mt-1">
          <span className="font-bold text-petroleo">Total</span>
          <span className="w-32 text-right tabular-nums text-2xl font-extrabold text-petroleo">{brl(o.total)}</span>
        </div>
      </div>

      {o.observacoes && (
        <Secao titulo="Observações">
          <div className="text-sm whitespace-pre-wrap rounded-lg border border-linha px-3 py-2">{o.observacoes}</div>
        </Secao>
      )}
    </div>
  );
}

function Linha({
  nome,
  tipo,
  qtd,
  unit,
  catalogo,
  total,
  aviso,
}: {
  nome: string;
  tipo: string;
  qtd: string;
  unit: number;
  catalogo: number;
  total: number;
  aviso?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
      <div className="flex-1 min-w-0">
        <div className="font-bold truncate">{nome}</div>
        <div className="text-xs text-grafite/50">
          {tipo} · {brl(unit)}
          {unit !== catalogo && <span> (tabela {brl(catalogo)})</span>}
          {aviso && (
            <span className="text-amarelo font-bold inline-flex items-center gap-0.5 ml-1.5">
              <AlertTriangle size={11} /> {aviso}
            </span>
          )}
        </div>
      </div>
      <div className="w-20 text-center tabular-nums text-grafite/70">{qtd}</div>
      <div className="w-28 text-right font-bold tabular-nums">{brl(total)}</div>
    </div>
  );
}
