import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ClipboardList, History } from 'lucide-react';
import { STATUS_OS_ABERTOS, brl, type FichaVeiculoDTO, type OrdemServicoDTO } from '@hermes/shared';
import { ApiError, http, mensagemDeErro } from '../../api/http';
import { foiDesistencia, useConfirmacoes } from '../../api/acoes';
import { useEquipe } from '../../api/catalogo';
import { useAvisos } from '../../lib/avisos';
import { LABEL_STATUS_OS, dataBR, daquiDias, deDataHoraLocal, hojeISO } from '../../lib/format';
import { textoParaNumero } from '../../lib/mascaras';
import { useSessao } from '../acesso/sessao';
import { AreaTexto, BtnGhost, BtnPrimary, Campo, ErroFormulario, InputDinheiro, Modal, Selecao, inputCls } from '../../components/ui';
import { SeletorClienteVeiculo, type ClienteEscolhido } from '../../components/SeletorClienteVeiculo';
import { EditorItens, ITENS_VAZIOS, calcularTotais, itensInvalidos, itensParaEnvio, type Itens } from '../../components/EditorItens';

// ============================================================
// OS direta, sem orçamento: o cliente chegou, o carro fica.
// Pode abrir vazia (só o diagnóstico) e lançar os itens depois.
// ============================================================

const PREVISOES = [
  { rotulo: 'Hoje 18h', valor: () => `${hojeISO()}T18:00` },
  { rotulo: 'Amanhã 18h', valor: () => `${daquiDias(1)}T18:00` },
  { rotulo: 'Em 2 dias', valor: () => `${daquiDias(2)}T18:00` },
];

export function NovaOS({
  carroInicial,
  onFechar,
  onCriada,
  onAbrirExistente,
}: {
  carroInicial?: string;
  onFechar: () => void;
  onCriada: (os: OrdemServicoDTO) => void;
  onAbrirExistente: (id: string) => void;
}) {
  const { pode } = useSessao();
  const qc = useQueryClient();
  const avisos = useAvisos();
  const confirmar = useConfirmacoes();
  const equipe = useEquipe('MECANICO');

  const [cliente, setCliente] = useState<ClienteEscolhido | null>(null);
  const [veiculoId, setVeiculoId] = useState<string | null>(null);
  const [km, setKm] = useState('');
  const [mecanicoId, setMecanicoId] = useState('');
  const [previsao, setPrevisao] = useState('');
  const [defeito, setDefeito] = useState('');
  const [itens, setItens] = useState<Itens>(ITENS_VAZIOS);
  const [desconto, setDesconto] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  // Vindo da busca por placa ou da ficha do veículo: já chega com o carro e o dono.
  const inicial = useQuery({
    queryKey: ['carros', carroInicial],
    queryFn: () => http.get<FichaVeiculoDTO>(`/carros/${carroInicial}`),
    enabled: !!carroInicial,
  });
  useEffect(() => {
    const v = inicial.data;
    if (!v) return;
    setCliente({ id: v.cliente.id, nome: v.cliente.nome, telefone: v.cliente.telefone, whatsapp: v.cliente.whatsapp });
    setVeiculoId(v.id);
  }, [inicial.data]);

  const ficha = useQuery({
    queryKey: ['carros', veiculoId],
    queryFn: () => http.get<FichaVeiculoDTO>(`/carros/${veiculoId}`),
    enabled: !!veiculoId,
  });

  const totais = calcularTotais(itens, desconto);
  const temItens = itens.servicos.length + itens.pecas.length > 0;

  async function enviar() {
    const e: Record<string, string> = {};
    if (!cliente) e.cliente = 'Escolha o cliente';
    if (!veiculoId) e.veiculo = 'Escolha o veículo';
    if (temItens) {
      const problema = itensInvalidos(itens);
      if (problema) e.geral = problema;
    }
    setErros(e);
    if (Object.keys(e).length > 0 || !cliente || !veiculoId) return;

    const corpo = {
      clienteId: cliente.id,
      carroId: veiculoId,
      mecanicoId: mecanicoId || null,
      kmEntrada: textoParaNumero(km),
      defeitoRelatado: defeito.trim() || null,
      dataPrevista: deDataHoraLocal(previsao),
      desconto: Number(desconto || 0),
      ...itensParaEnvio(itens),
    };

    setEnviando(true);
    try {
      const os = await confirmar((x) => http.post<OrdemServicoDTO>('/ordens', { ...corpo, ...x }));
      await Promise.all([['ordens'], ['pecas'], ['alertas'], ['carros']].map((queryKey) => qc.invalidateQueries({ queryKey })));
      avisos.sucesso(`OS #${os.numero} aberta.${os.status === 'AGUARDANDO_PECA' ? ' Ficou aguardando peça.' : ''}`);
      onCriada(os);
    } catch (err) {
      if (foiDesistencia(err)) return;
      if (err instanceof ApiError && err.erros) {
        const c = err.erros;
        setErros({
          cliente: c.clienteId?.[0] ?? '',
          veiculo: c.carroId?.[0] ?? '',
          geral: Object.entries(c)
            .filter(([k]) => k !== 'clienteId' && k !== 'carroId')
            .map(([, v]) => v[0])
            .join(' ') || '',
        });
      } else {
        setErros({ geral: mensagemDeErro(err) });
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      title="Nova Ordem de Serviço"
      size="xl"
      onClose={onFechar}
      onEnviar={() => void enviar()}
      footer={
        <>
          <span className="mr-auto self-center text-sm text-grafite/55">
            Total <strong className="text-lg text-petroleo tabular-nums ml-1">{brl(totais.total)}</strong>
          </span>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary type="submit" icone={ClipboardList} disabled={enviando}>
            {enviando ? 'Abrindo...' : 'Abrir OS'}
          </BtnPrimary>
        </>
      }
    >
      <SeletorClienteVeiculo
        cliente={cliente}
        onCliente={setCliente}
        veiculoId={veiculoId}
        onVeiculo={setVeiculoId}
        erroCliente={erros.cliente || undefined}
        erroVeiculo={erros.veiculo || undefined}
      />

      {veiculoId && ficha.data?.id === veiculoId && <ResumoDoVeiculo v={ficha.data} onAbrirExistente={onAbrirExistente} />}

      <div className="grid sm:grid-cols-3 gap-3">
        <Campo label="KM na entrada">
          <input
            inputMode="numeric"
            value={km}
            onChange={(e) => setKm(e.target.value.replace(/\D/g, ''))}
            className={`${inputCls} tabular-nums`}
            placeholder={ficha.data?.kmAtual != null ? `último: ${ficha.data.kmAtual.toLocaleString('pt-BR')}` : 'Ex.: 85000'}
          />
        </Campo>
        <Campo label="Mecânico">
          <Selecao value={mecanicoId} onChange={(e) => setMecanicoId(e.target.value)}>
            <option value="">— definir depois —</option>
            {(equipe.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </Selecao>
        </Campo>
        <Campo label="Previsão de entrega">
          <input type="datetime-local" value={previsao} onChange={(e) => setPrevisao(e.target.value)} className={inputCls} />
        </Campo>
      </div>
      <div className="flex gap-1.5 flex-wrap -mt-1.5 sm:justify-end">
        {PREVISOES.map((p) => (
          <button
            key={p.rotulo}
            type="button"
            onClick={() => setPrevisao(p.valor())}
            className="text-xs font-semibold px-2.5 py-1 rounded-full bg-fundo hover:bg-linha text-grafite/70"
          >
            {p.rotulo}
          </button>
        ))}
      </div>

      <Campo label="Queixa do cliente" ajuda="O que o cliente contou — barulho, luz no painel, desde quando.">
        <AreaTexto value={defeito} onChange={(e) => setDefeito(e.target.value)} maxLength={1000} rows={2} />
      </Campo>

      <EditorItens valor={itens} onChange={setItens} podeAlterarPreco={pode('darDesconto')} podeCadastrarServico={pode('atender')} />
      {!temItens && <p className="text-xs text-grafite/50 -mt-1.5">Pode abrir sem itens (só o diagnóstico) e lançar os serviços e peças depois, na própria OS.</p>}

      {temItens && (
        <div className="flex items-end justify-end gap-4 flex-wrap">
          {pode('darDesconto') && (
            <Campo label="Desconto" className="w-40">
              <InputDinheiro value={desconto} onChange={setDesconto} />
            </Campo>
          )}
          <div className="text-right text-sm">
            <div className="text-grafite/55">
              Subtotal <span className="tabular-nums font-semibold text-grafite">{brl(totais.subtotal)}</span>
            </div>
            {totais.desconto > 0 && (
              <div className="text-grafite/55">
                Desconto <span className="tabular-nums font-semibold text-vermelho">−{brl(totais.desconto)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <ErroFormulario>{erros.geral}</ErroFormulario>
    </Modal>
  );
}

/**
 * O que o balcão precisa saber quando o carro chega (RN-16/17): já tem OS
 * aberta? Quando veio da última vez? O dono está devendo?
 */
function ResumoDoVeiculo({ v, onAbrirExistente }: { v: FichaVeiculoDTO; onAbrirExistente: (id: string) => void }) {
  const aberta = v.historico.find((o) => STATUS_OS_ABERTOS.includes(o.status));
  const ultima = v.historico.find((o) => o.status === 'ENTREGUE');

  if (!aberta && !ultima && !(v.fiado && v.fiado.emAberto > 0)) return null;
  return (
    <div className="space-y-2">
      {aberta && (
        <div className="flex items-center gap-2 flex-wrap bg-amarelo-bg text-amarelo rounded-xl px-3.5 py-2.5 text-sm font-bold">
          <AlertTriangle size={16} className="shrink-0" />
          Este carro já está na oficina: OS #{aberta.numero} ({LABEL_STATUS_OS[aberta.status].toLowerCase()}).
          <button type="button" onClick={() => onAbrirExistente(aberta.id)} className="underline ml-auto">
            Abrir a OS #{aberta.numero}
          </button>
        </div>
      )}
      {v.fiado && v.fiado.emAberto > 0 && (
        <div
          className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-bold ${
            v.fiado.bloqueado ? 'bg-vermelho-bg text-vermelho' : 'bg-fundo text-grafite/70'
          }`}
        >
          <AlertTriangle size={16} className="shrink-0" />
          {v.cliente.nome.split(' ')[0]} tem {brl(v.fiado.emAberto)} em aberto
          {v.fiado.vencido > 0 && ` — ${brl(v.fiado.vencido)} vencido`}.
        </div>
      )}
      {ultima && (
        <div className="flex items-start gap-2 text-sm text-grafite/60 px-1">
          <History size={15} className="shrink-0 mt-0.5" />
          <span>
            Última visita em {dataBR(ultima.dataAbertura)}
            {ultima.kmEntrada != null && `, com ${ultima.kmEntrada.toLocaleString('pt-BR')} km`}: {ultima.servicos.join(', ') || 'sem serviço lançado'}.
          </span>
        </div>
      )}
    </div>
  );
}
