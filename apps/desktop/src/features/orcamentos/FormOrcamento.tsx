import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Zap, UserRound, FileText } from 'lucide-react';
import { brl, type FichaVeiculoDTO, type OrcamentoDTO } from '@hermes/shared';
import { ApiError, http, mensagemDeErro } from '../../api/http';
import { foiDesistencia, useConfirmacoes } from '../../api/acoes';
import { useOficina } from '../../api/catalogo';
import { useAvisos } from '../../lib/avisos';
import { mascaraTelefone } from '../../lib/mascaras';
import { useSessao } from '../acesso/sessao';
import { AreaTexto, BtnGhost, BtnPrimary, Campo, ErroFormulario, InputDinheiro, Modal, inputCls } from '../../components/ui';
import { SeletorClienteVeiculo, type ClienteEscolhido } from '../../components/SeletorClienteVeiculo';
import { EditorItens, ITENS_VAZIOS, calcularTotais, itensDoDTO, itensInvalidos, itensParaEnvio, type Itens } from '../../components/EditorItens';

// ============================================================
// Montar (ou corrigir) um orçamento.
//
// RÁPIDO é o padrão ao criar: quem só quer saber um preço não passa
// por dois cadastros antes de ouvir o valor. O cadastro fica para a
// hora em que o orçamento vira serviço.
// ============================================================

type Modo = 'RAPIDO' | 'COMPLETO';

export function FormOrcamento({
  orc,
  carroInicial,
  onFechar,
  onSalvo,
}: {
  orc?: OrcamentoDTO;
  carroInicial?: string;
  onFechar: () => void;
  onSalvo: (o: OrcamentoDTO) => void;
}) {
  const { pode } = useSessao();
  const oficina = useOficina();
  const qc = useQueryClient();
  const avisos = useAvisos();
  const confirmar = useConfirmacoes();

  const [modo, setModo] = useState<Modo>(orc ? (orc.clienteId ? 'COMPLETO' : 'RAPIDO') : carroInicial ? 'COMPLETO' : 'RAPIDO');
  const [cliente, setCliente] = useState<ClienteEscolhido | null>(orc?.cliente ? { ...orc.cliente } : null);
  const [veiculoId, setVeiculoId] = useState<string | null>(orc?.carroId ?? null);
  const [contatoNome, setContatoNome] = useState(orc?.contatoNome ?? '');
  const [contatoTelefone, setContatoTelefone] = useState(mascaraTelefone(orc?.contatoTelefone));
  const [veiculoDescricao, setVeiculoDescricao] = useState(orc?.veiculoDescricao ?? '');
  const [itens, setItens] = useState<Itens>(orc ? itensDoDTO(orc.servicos, orc.pecas) : ITENS_VAZIOS);
  const [desconto, setDesconto] = useState(orc?.desconto ? orc.desconto.toFixed(2) : '');
  const [validade, setValidade] = useState('');
  const [observacoes, setObservacoes] = useState(orc?.observacoes ?? '');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  // Vindo da busca por placa: o orçamento já nasce com o carro e o dono.
  const inicial = useQuery({
    queryKey: ['carros', carroInicial],
    queryFn: () => http.get<FichaVeiculoDTO>(`/carros/${carroInicial}`),
    enabled: !!carroInicial && !orc,
  });
  useEffect(() => {
    const v = inicial.data;
    if (!v) return;
    setCliente((c) => c ?? { id: v.cliente.id, nome: v.cliente.nome, telefone: v.cliente.telefone, whatsapp: v.cliente.whatsapp });
    setVeiculoId((atual) => atual ?? v.id);
  }, [inicial.data]);

  const totais = calcularTotais(itens, desconto);

  async function enviar() {
    const e: Record<string, string> = {};
    const problema = itensInvalidos(itens);
    if (problema) e.itens = problema;
    if (modo === 'COMPLETO' && !cliente) e.cliente = 'Escolha o cliente (ou use o orçamento rápido)';
    const dias = validade ? Number(validade) : undefined;
    if (dias !== undefined && (!Number.isInteger(dias) || dias < 1 || dias > 180)) e.validade = 'De 1 a 180 dias';
    setErros(e);
    if (Object.keys(e).length > 0) return;

    const rapido = modo === 'RAPIDO';
    const corpo = {
      clienteId: rapido ? null : cliente!.id,
      carroId: rapido ? null : veiculoId,
      contatoNome: rapido ? contatoNome.trim() || null : null,
      contatoTelefone: rapido ? contatoTelefone || null : null,
      veiculoDescricao: rapido ? veiculoDescricao.trim() || null : null,
      validadeDias: dias,
      desconto: Number(desconto || 0),
      observacoes: observacoes.trim() || null,
      ...itensParaEnvio(itens),
    };

    setEnviando(true);
    try {
      const salvo = await confirmar((x) =>
        orc ? http.put<OrcamentoDTO>(`/orcamentos/${orc.id}`, { ...corpo, ...x, versao: orc.versao }) : http.post<OrcamentoDTO>('/orcamentos', { ...corpo, ...x }),
      );
      qc.setQueryData(['orcamentos', salvo.id], salvo);
      await qc.invalidateQueries({ queryKey: ['orcamentos'] });
      avisos.sucesso(orc ? `Orçamento #${salvo.numero} atualizado.` : `Orçamento #${salvo.numero} criado — ${brl(salvo.total)}.`);
      onSalvo(salvo);
    } catch (err) {
      if (foiDesistencia(err)) return;
      if (err instanceof ApiError && err.erros) {
        const c = err.erros;
        setErros({
          contatoTelefone: c.contatoTelefone?.[0] ?? '',
          cliente: c.clienteId?.[0] ?? '',
          itens: c.servicos?.[0] ?? c.pecas?.[0] ?? '',
          geral: c.desconto?.[0] ?? c.observacoes?.[0] ?? '',
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
      title={orc ? `Editar orçamento #${orc.numero}` : 'Novo orçamento'}
      size="xl"
      onClose={onFechar}
      onEnviar={() => void enviar()}
      footer={
        <>
          <span className="mr-auto self-center text-sm text-grafite/55">
            Total <strong className="text-lg text-petroleo tabular-nums ml-1">{brl(totais.total)}</strong>
          </span>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary type="submit" icone={FileText} disabled={enviando}>
            {enviando ? 'Salvando...' : orc ? 'Salvar orçamento' : 'Criar orçamento'}
          </BtnPrimary>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de orçamento">
        {(
          [
            { id: 'RAPIDO', icone: Zap, titulo: 'Rápido', ajuda: 'Só um nome e o carro, sem cadastro' },
            { id: 'COMPLETO', icone: UserRound, titulo: 'Com cadastro', ajuda: 'Cliente (e veículo) cadastrados' },
          ] as const
        ).map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={modo === m.id}
            onClick={() => setModo(m.id)}
            className={`text-left border-[1.6px] rounded-xl px-3.5 py-2.5 flex items-start gap-2.5 transition ${
              modo === m.id ? 'border-laranja bg-laranja/5' : 'border-linha hover:bg-fundo'
            }`}
          >
            <m.icone size={18} className={modo === m.id ? 'text-laranja mt-0.5' : 'text-grafite/40 mt-0.5'} />
            <span>
              <span className="block font-bold text-sm">{m.titulo}</span>
              <span className="block text-xs text-grafite/50">{m.ajuda}</span>
            </span>
          </button>
        ))}
      </div>

      {modo === 'RAPIDO' ? (
        <div className="grid sm:grid-cols-3 gap-3">
          <Campo label="Nome (opcional)">
            <input value={contatoNome} onChange={(e) => setContatoNome(e.target.value)} className={inputCls} maxLength={120} placeholder="Ex.: João" />
          </Campo>
          <Campo label="Telefone (opcional)" erro={erros.contatoTelefone || undefined} ajuda="Para mandar pelo WhatsApp.">
            <input
              inputMode="tel"
              value={contatoTelefone}
              onChange={(e) => setContatoTelefone(mascaraTelefone(e.target.value))}
              className={inputCls}
              placeholder="(11) 98888-7777"
            />
          </Campo>
          <Campo label="Veículo (opcional)">
            <input value={veiculoDescricao} onChange={(e) => setVeiculoDescricao(e.target.value)} className={inputCls} maxLength={120} placeholder="Ex.: Gol 2015" />
          </Campo>
        </div>
      ) : (
        <SeletorClienteVeiculo
          cliente={cliente}
          onCliente={setCliente}
          veiculoId={veiculoId}
          onVeiculo={setVeiculoId}
          veiculoOpcional
          erroCliente={erros.cliente || undefined}
          sugestao={{ nome: contatoNome, telefone: contatoTelefone, veiculo: veiculoDescricao }}
        />
      )}

      <EditorItens valor={itens} onChange={setItens} podeAlterarPreco={pode('darDesconto')} podeCadastrarServico={pode('atender')} />
      {erros.itens && <p className="text-vermelho text-xs font-semibold -mt-1.5">{erros.itens}</p>}

      <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3 items-start">
        <Campo label="Observações (saem no orçamento)">
          <AreaTexto value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} maxLength={1000} placeholder="Ex.: valores válidos para pagamento à vista." />
        </Campo>
        <Campo label="Validade (dias)" erro={erros.validade} className="sm:w-32">
          <input
            inputMode="numeric"
            value={validade}
            onChange={(e) => setValidade(e.target.value.replace(/\D/g, '').slice(0, 3))}
            placeholder={String(oficina.validadeOrcamentoDias)}
            className={`${inputCls} tabular-nums`}
          />
        </Campo>
        {pode('darDesconto') && (
          <Campo label="Desconto" className="sm:w-40">
            <InputDinheiro value={desconto} onChange={setDesconto} />
          </Campo>
        )}
      </div>
      {orc && <p className="text-xs text-grafite/50 -mt-1.5">Salvar renova a validade a partir de hoje.</p>}
      {totais.desconto > 0 && (
        <div className="text-right text-sm text-grafite/55">
          Subtotal <span className="tabular-nums font-semibold text-grafite">{brl(totais.subtotal)}</span> · desconto{' '}
          <span className="tabular-nums font-semibold text-vermelho">−{brl(totais.desconto)}</span>
        </div>
      )}

      <ErroFormulario>{erros.geral}</ErroFormulario>
    </Modal>
  );
}
