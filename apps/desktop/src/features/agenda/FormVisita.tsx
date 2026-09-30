import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, CheckCircle2, ClipboardList, Trash2, UserX } from 'lucide-react';
import { TIPOS_VISITA, type TipoVisita, type VisitaDTO } from '@hermes/shared';
import { ApiError, http, mensagemDeErro } from '../../api/http';
import { foiDesistencia, useConfirmacoes } from '../../api/acoes';
import { useOficina } from '../../api/catalogo';
import { useAvisos } from '../../lib/avisos';
import { LABEL_TIPO_VISITA, hojeISO, paraDataISO } from '../../lib/format';
import { linkWhatsApp, mensagens } from '../../lib/whatsapp';
import { useSessao } from '../acesso/sessao';
import { AreaTexto, BtnGhost, BtnPrimary, BtnWhatsApp, Campo, ErroFormulario, MenuMais, Modal, Selecao, inputCls } from '../../components/ui';
import { SeletorClienteVeiculo, type ClienteEscolhido } from '../../components/SeletorClienteVeiculo';

const HORARIOS = ['08:00', '09:00', '10:00', '11:00', '13:30', '14:30', '15:30', '16:30'];

const doisDigitos = (n: number) => String(n).padStart(2, '0');

export function FormVisita({ visita, diaInicial, onFechar }: { visita: VisitaDTO | null; diaInicial?: string; onFechar: () => void }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const avisos = useAvisos();
  const oficina = useOficina();
  const confirmar = useConfirmacoes();
  const { pode } = useSessao();
  const quando = visita ? new Date(visita.dataHora) : null;

  const [cliente, setCliente] = useState<ClienteEscolhido | null>(visita ? { ...visita.cliente } : null);
  const [veiculoId, setVeiculoId] = useState<string | null>(visita?.carro?.id ?? null);
  const [dia, setDia] = useState(quando ? paraDataISO(quando) : (diaInicial ?? hojeISO()));
  const [hora, setHora] = useState(quando ? `${doisDigitos(quando.getHours())}:${doisDigitos(quando.getMinutes())}` : '09:00');
  const [tipo, setTipo] = useState<TipoVisita>(visita?.tipo ?? 'REVISAO');
  const [observacoes, setObservacoes] = useState(visita?.observacoes ?? '');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const editavel = pode('atender');

  async function atualizarListas() {
    await qc.invalidateQueries({ queryKey: ['agenda'] });
  }

  async function salvar() {
    if (!cliente) return setErros({ cliente: 'Escolha o cliente' });
    if (!dia || !hora) return setErros({ geral: 'Informe o dia e a hora' });
    const dataHora = new Date(`${dia}T${hora}`).toISOString();
    const corpo = { carroId: veiculoId, dataHora, tipo, observacoes: observacoes.trim() || null };

    setEnviando(true);
    try {
      await confirmar((x) =>
        visita
          ? http.put<VisitaDTO>(`/agenda/${visita.id}`, { ...corpo, ignorarConflito: x.ignorarConflito ?? false, versao: visita.versao })
          : http.post<VisitaDTO>('/agenda', { ...corpo, clienteId: cliente.id, ignorarConflito: x.ignorarConflito ?? false }),
      );
      await atualizarListas();
      avisos.sucesso(visita ? 'Agendamento atualizado.' : 'Horário marcado.');
      onFechar();
    } catch (e) {
      if (foiDesistencia(e)) return;
      setErros({ geral: e instanceof ApiError && e.erros ? Object.values(e.erros).map((v) => v[0]).join(' ') : mensagemDeErro(e) });
    } finally {
      setEnviando(false);
    }
  }

  async function status(novo: 'CONFIRMADA' | 'REALIZADA' | 'FALTOU' | 'AGENDADA', msg: string) {
    if (!visita) return;
    try {
      await http.patch(`/agenda/${visita.id}/status`, { status: novo });
      await atualizarListas();
      avisos.sucesso(msg);
      onFechar();
    } catch (e) {
      avisos.erro(mensagemDeErro(e));
    }
  }

  async function excluir() {
    if (!visita) return;
    const ok = await avisos.confirmar({ titulo: 'Desmarcar este horário?', mensagem: 'O agendamento sai da agenda.', botao: 'Desmarcar', perigo: true });
    if (!ok) return;
    try {
      await http.delete(`/agenda/${visita.id}`);
      await atualizarListas();
      avisos.sucesso('Horário desmarcado.');
      onFechar();
    } catch (e) {
      avisos.erro(mensagemDeErro(e));
    }
  }

  const aberta = visita && (visita.status === 'AGENDADA' || visita.status === 'CONFIRMADA');

  return (
    <Modal
      title={visita ? 'Agendamento' : 'Marcar horário'}
      size="lg"
      onClose={onFechar}
      onEnviar={editavel ? () => void salvar() : undefined}
      footer={
        <>
          {visita && editavel && (
            <div className="mr-auto flex gap-2 flex-wrap">
              <MenuMais
                itens={[
                  { rotulo: 'Cliente veio (realizada)', icone: CheckCircle2, onClick: () => void status('REALIZADA', 'Visita marcada como realizada.'), visivel: !!aberta },
                  { rotulo: 'Cliente faltou', icone: UserX, onClick: () => void status('FALTOU', 'Falta registrada.'), visivel: !!aberta },
                  { rotulo: 'Voltar para agendada', icone: CalendarCheck, onClick: () => void status('AGENDADA', 'Agendamento reaberto.'), visivel: !aberta },
                  { rotulo: 'Desmarcar', icone: Trash2, perigo: true, onClick: () => void excluir() },
                ]}
              />
              {visita.carro && pode('atender') && (
                <BtnGhost icone={ClipboardList} onClick={() => navegar(`/ordens?nova=1&carro=${visita.carro!.id}`)}>
                  Abrir OS
                </BtnGhost>
              )}
            </div>
          )}
          {visita && (
            <BtnWhatsApp href={linkWhatsApp(visita.cliente.whatsapp ?? visita.cliente.telefone, mensagens.lembreteVisita(visita, oficina))}>Lembrar</BtnWhatsApp>
          )}
          {visita?.status === 'AGENDADA' && editavel && (
            <BtnGhost icone={CalendarCheck} onClick={() => void status('CONFIRMADA', 'Horário confirmado.')}>
              Confirmado
            </BtnGhost>
          )}
          {editavel ? (
            <BtnPrimary type="submit" disabled={enviando}>
              {enviando ? 'Salvando...' : visita ? 'Salvar' : 'Marcar'}
            </BtnPrimary>
          ) : (
            <BtnGhost onClick={onFechar}>Fechar</BtnGhost>
          )}
        </>
      }
    >
      <SeletorClienteVeiculo
        cliente={cliente}
        onCliente={setCliente}
        veiculoId={veiculoId}
        onVeiculo={setVeiculoId}
        veiculoOpcional
        clienteFixo={!!visita || !editavel}
        erroCliente={erros.cliente}
      />
      <div className="grid sm:grid-cols-3 gap-3">
        <Campo label="Dia">
          <input type="date" value={dia} onChange={(e) => setDia(e.target.value)} className={inputCls} disabled={!editavel} />
        </Campo>
        <Campo label="Hora">
          <input type="time" value={hora} step={900} onChange={(e) => setHora(e.target.value)} className={inputCls} disabled={!editavel} />
        </Campo>
        <Campo label="Motivo">
          <Selecao value={tipo} onChange={(e) => setTipo(e.target.value as TipoVisita)} disabled={!editavel}>
            {TIPOS_VISITA.map((t) => (
              <option key={t} value={t}>
                {LABEL_TIPO_VISITA[t]}
              </option>
            ))}
          </Selecao>
        </Campo>
      </div>
      {editavel && (
        <div className="flex gap-1.5 flex-wrap -mt-1.5">
          {HORARIOS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHora(h)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full ${hora === h ? 'bg-petroleo text-white' : 'bg-fundo hover:bg-linha text-grafite/70'}`}
            >
              {h}
            </button>
          ))}
        </div>
      )}
      <Campo label="Observações">
        <AreaTexto value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} maxLength={500} disabled={!editavel} />
      </Campo>
      <ErroFormulario>{erros.geral}</ErroFormulario>
    </Modal>
  );
}
