import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Pencil, AlertTriangle, Receipt, CheckCircle2, StickyNote, Car, ClipboardList, UserX } from 'lucide-react';
import { brl, LABEL_TIPO_PESSOA, type ClienteFichaDTO } from '@hermes/shared';
import { http } from '../../api/http';
import { useAcao } from '../../api/acoes';
import { useOficina } from '../../api/catalogo';
import { useAvisos } from '../../lib/avisos';
import { linkWhatsApp } from '../../lib/whatsapp';
import {
  CORES_STATUS_OS,
  LABEL_STATUS_OS,
  dataBR,
  formatarDocumento,
  formatarTelefone,
  iniciais,
} from '../../lib/format';
import { useSessao } from '../acesso/sessao';
import { Badge, BtnGhost, BtnPerigo, BtnPrimary, BtnWhatsApp, InfoLinha, Modal, Placa, Secao, Vazio } from '../../components/ui';

/** Ficha do cliente: contato, veículos, fiado e histórico de OS (RN-16/17). */
export default function FichaCliente({ clienteId, onFechar, onEditar }: { clienteId: string; onFechar: () => void; onEditar: () => void }) {
  const navegar = useNavigate();
  const avisos = useAvisos();
  const oficina = useOficina();
  const { pode } = useSessao();
  const { data: c, error } = useQuery({
    queryKey: ['clientes', clienteId],
    queryFn: () => http.get<ClienteFichaDTO>(`/clientes/${clienteId}`),
  });

  const anonimizar = useAcao(() => http.post(`/clientes/${clienteId}/anonimizar`), {
    invalidar: [['clientes'], ['carros']],
    sucesso: 'Dados pessoais apagados. O histórico financeiro continua, sem identificação.',
  });

  async function pedirAnonimizacao() {
    const ok = await avisos.confirmar({
      titulo: 'Apagar os dados pessoais (LGPD)',
      mensagem:
        'Nome, documento, telefone, e-mail e endereço deste cliente são apagados para sempre, e os veículos saem da lista. ' +
        'As OS e o caixa continuam (a oficina precisa deles), mas sem identificar a pessoa. Não dá para desfazer.',
      botao: 'Apagar dados pessoais',
      perigo: true,
    });
    if (ok) anonimizar.mutate(undefined, { onSuccess: onFechar });
  }

  const zap = c ? (c.whatsapp ?? c.telefone) : null;

  return (
    <Modal
      title={c ? c.nome : 'Ficha do cliente'}
      size="lg"
      onClose={onFechar}
      semConfirmarDescarte
      footer={
        <>
          {c && pode('apagarRegistros') && (
            <BtnPerigo icone={UserX} onClick={() => void pedirAnonimizacao()} className="mr-auto" disabled={anonimizar.isPending}>
              LGPD: apagar dados
            </BtnPerigo>
          )}
          <BtnGhost onClick={onFechar}>Fechar</BtnGhost>
          <BtnPrimary icone={Pencil} onClick={onEditar}>
            Editar cadastro
          </BtnPrimary>
        </>
      }
    >
      {!c ? (
        <div className="text-center text-grafite/40 py-8 text-sm">{error ? 'Não foi possível carregar a ficha' : 'Carregando...'}</div>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="w-12 h-12 rounded-full bg-petroleo text-white grid place-items-center font-bold shrink-0">{iniciais(c.nome)}</span>
            <div className="flex-1 min-w-0">
              <Badge>{LABEL_TIPO_PESSOA[c.tipo]}</Badge>
              <div className="text-xs text-grafite/50 mt-1">
                Cliente desde {dataBR(c.dataCadastro)} · já gastou {brl(c.totalGasto)}
              </div>
            </div>
            <BtnWhatsApp href={linkWhatsApp(zap, `Olá, ${c.nome.split(' ')[0]}! Aqui é da ${oficina.nome}.`)}>Chamar no WhatsApp</BtnWhatsApp>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 bg-fundo rounded-xl p-3 text-sm">
            <InfoLinha rotulo="Telefone" valor={formatarTelefone(c.telefone)} />
            <InfoLinha rotulo="WhatsApp" valor={formatarTelefone(c.whatsapp)} />
            <InfoLinha rotulo="E-mail" valor={c.email} />
            <InfoLinha rotulo={c.tipo === 'PJ' ? 'CNPJ' : 'CPF'} valor={formatarDocumento(c.cpfCnpj)} />
            <div className="col-span-2">
              <InfoLinha rotulo="Endereço" valor={c.endereco} />
            </div>
          </div>

          {c.fiado.emAberto > 0 && (
            <div className={`rounded-xl p-3 flex items-center gap-3 ${c.fiado.bloqueado ? 'bg-vermelho-bg' : 'bg-amarelo-bg'}`}>
              {c.fiado.bloqueado ? <AlertTriangle size={26} className="text-vermelho shrink-0" /> : <Receipt size={26} className="text-amarelo shrink-0" />}
              <div className="flex-1">
                <div className="text-xs font-semibold text-grafite/60">Fiado em aberto</div>
                <div className="text-xl font-extrabold text-petroleo">{brl(c.fiado.emAberto)}</div>
              </div>
              <div className="text-right text-xs text-grafite/60">
                {c.parcelasEmAberto.length} parcela(s)
                {c.fiado.bloqueado && <div className="text-vermelho font-bold">{brl(c.fiado.vencido)} vencido</div>}
              </div>
            </div>
          )}

          <Secao titulo={`Veículos (${c.veiculos.length})`}>
            {c.veiculos.length === 0 ? (
              <Vazio>Nenhum veículo cadastrado</Vazio>
            ) : (
              <div className="grid sm:grid-cols-2 gap-2">
                {c.veiculos.map((v) => (
                  <div key={v.id} className="border border-linha rounded-lg px-3 py-2 flex items-center gap-2">
                    <Car size={16} className="text-grafite/40 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Placa placa={v.placa} />
                        <span className="font-bold text-sm truncate">
                          {v.marca} {v.modelo}
                        </span>
                      </div>
                      <div className="text-xs text-grafite/50 mt-0.5">
                        {v.ano ?? '—'}
                        {v.kmAtual != null ? ` · ${v.kmAtual.toLocaleString('pt-BR')} km` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Secao>

          {c.parcelasEmAberto.length > 0 && (
            <Secao titulo="Parcelas em aberto">
              <div className="border border-linha rounded-lg divide-y divide-linha">
                {c.parcelasEmAberto.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm flex-wrap">
                    <span className="text-grafite/60">
                      {p.os ? `OS #${p.os.numero}` : (p.descricao ?? 'Fiado')} · {p.parcela}/{p.totalParcelas}
                    </span>
                    <span className={`text-xs ${p.emAtraso ? 'text-vermelho font-bold' : 'text-grafite/50'}`}>vence {dataBR(p.vencimento)}</span>
                    {p.emAtraso && <Badge cor="bg-vermelho-bg text-vermelho">em atraso</Badge>}
                    <span className="ml-auto font-bold tabular-nums">{brl(p.saldo)}</span>
                  </div>
                ))}
              </div>
            </Secao>
          )}

          <Secao titulo={`Últimas ordens de serviço (${c.ordens.length})`}>
            {c.ordens.length === 0 ? (
              <Vazio>Nenhuma OS ainda</Vazio>
            ) : (
              <div className="border border-linha rounded-lg divide-y divide-linha">
                {c.ordens.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => navegar(`/ordens?abrir=${o.id}`)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2 text-sm hover:bg-fundo/60"
                  >
                    <ClipboardList size={14} className="text-grafite/40 shrink-0" />
                    <span className="font-mono font-bold text-grafite/50">#{o.numero}</span>
                    <span className="text-grafite/60 whitespace-nowrap">{dataBR(o.dataAbertura)}</span>
                    <span className="truncate">{o.carro.modelo}</span>
                    <Badge cor={CORES_STATUS_OS[o.status]}>{LABEL_STATUS_OS[o.status]}</Badge>
                    <span className="ml-auto font-bold tabular-nums">{brl(o.total)}</span>
                    {o.pago && o.formaPagamento && (
                      <span title="Pago" className="text-verde">
                        <CheckCircle2 size={15} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </Secao>

          {c.observacoes && (
            <div className="text-sm text-grafite/70 bg-amarelo-bg/40 rounded-lg p-3 flex gap-2">
              <StickyNote size={16} className="shrink-0 mt-0.5 text-amarelo" />
              <span className="whitespace-pre-line">{c.observacoes}</span>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
