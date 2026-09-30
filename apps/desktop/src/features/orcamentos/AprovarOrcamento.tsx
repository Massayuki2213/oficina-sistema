import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Link2 } from 'lucide-react';
import { brl, type AprovacaoDTO, type OrcamentoDTO } from '@hermes/shared';
import { ApiError, http, mensagemDeErro } from '../../api/http';
import { foiDesistencia, useConfirmacoes } from '../../api/acoes';
import { useEquipe } from '../../api/catalogo';
import { useAvisos } from '../../lib/avisos';
import { deDataHoraLocal } from '../../lib/format';
import { textoParaNumero } from '../../lib/mascaras';
import { AreaTexto, BtnGhost, BtnPrimary, Campo, ErroFormulario, Modal, Selecao, inputCls } from '../../components/ui';
import { SeletorClienteVeiculo, type ClienteEscolhido } from '../../components/SeletorClienteVeiculo';

const clienteDoOrcamento = (o: OrcamentoDTO): ClienteEscolhido | null => (o.cliente ? { ...o.cliente } : null);

// ============================================================
// RN-07 — aprovar é gerar a OS em um passo, com os itens e preços
// combinados. Orçamento rápido pede o cadastro AQUI: a OS baixa
// estoque, dá garantia e entra no histórico do carro, então precisa
// saber de quem é o carro.
// ============================================================

export function AprovarOrcamento({
  orc,
  onFechar,
  onAprovado,
}: {
  orc: OrcamentoDTO;
  onFechar: () => void;
  onAprovado: (r: AprovacaoDTO) => void;
}) {
  const qc = useQueryClient();
  const avisos = useAvisos();
  const confirmar = useConfirmacoes();
  const equipe = useEquipe('MECANICO');
  const precisaVeiculo = !orc.carroId;

  const [cliente, setCliente] = useState<ClienteEscolhido | null>(clienteDoOrcamento(orc));
  const [veiculoId, setVeiculoId] = useState<string | null>(orc.carroId);
  const [km, setKm] = useState('');
  const [mecanicoId, setMecanicoId] = useState('');
  const [previsao, setPrevisao] = useState('');
  const [defeito, setDefeito] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  async function aprovar() {
    if (precisaVeiculo) {
      const e: Record<string, string> = {};
      if (!cliente) e.cliente = 'Escolha ou cadastre o cliente';
      if (!veiculoId) e.veiculo = 'Escolha ou cadastre o veículo';
      setErros(e);
      if (Object.keys(e).length) return;
    }
    const corpo = {
      clienteId: orc.clienteId ? undefined : cliente?.id,
      carroId: orc.carroId ? undefined : veiculoId,
      mecanicoId: mecanicoId || null,
      kmEntrada: textoParaNumero(km),
      defeitoRelatado: defeito.trim() || null,
      dataPrevista: deDataHoraLocal(previsao),
    };

    setEnviando(true);
    try {
      const r = await confirmar((x) => http.post<AprovacaoDTO>(`/orcamentos/${orc.id}/aprovar`, { ...corpo, ...x }));
      await Promise.all([['orcamentos'], ['ordens'], ['pecas'], ['alertas'], ['carros'], ['clientes']].map((queryKey) => qc.invalidateQueries({ queryKey })));
      if (r.aguardandoPeca) avisos.info(`OS #${r.os.numero} aberta — nasce aguardando peça (falta no estoque).`);
      else avisos.sucesso(`Orçamento aprovado: OS #${r.os.numero} aberta.`);
      onAprovado(r);
    } catch (err) {
      if (foiDesistencia(err)) return;
      if (err instanceof ApiError && err.erros) {
        setErros({ geral: Object.values(err.erros).map((v) => v[0]).join(' ') });
      } else {
        setErros({ geral: mensagemDeErro(err) });
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      title={`Aprovar o orçamento #${orc.numero}`}
      size="lg"
      onClose={onFechar}
      onEnviar={() => void aprovar()}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Voltar</BtnGhost>
          <BtnPrimary type="submit" icone={ClipboardList} disabled={enviando}>
            {enviando ? 'Abrindo a OS...' : 'Aprovar e abrir a OS'}
          </BtnPrimary>
        </>
      }
    >
      <p className="text-sm text-grafite/65 leading-snug">
        A OS nasce com os {orc.servicos.length + orc.pecas.length} item(ns) e os preços deste orçamento (<strong>{brl(orc.total)}</strong>), e as
        peças já saem do estoque.
      </p>

      {precisaVeiculo && (
        <div className="border-[1.6px] border-laranja/30 bg-laranja/5 rounded-xl p-3.5 space-y-3">
          <div className="text-sm font-bold text-petroleo inline-flex items-center gap-1.5">
            <Link2 size={15} /> {orc.clienteId ? 'Em qual veículo?' : 'De quem é o carro?'}
          </div>
          <SeletorClienteVeiculo
            cliente={cliente}
            onCliente={setCliente}
            veiculoId={veiculoId}
            onVeiculo={setVeiculoId}
            clienteFixo={!!orc.clienteId}
            erroCliente={erros.cliente}
            erroVeiculo={erros.veiculo}
            sugestao={{ nome: orc.contatoNome, telefone: orc.contatoTelefone, veiculo: orc.veiculoDescricao }}
          />
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-3">
        <Campo label="KM na entrada">
          <input
            inputMode="numeric"
            value={km}
            onChange={(e) => setKm(e.target.value.replace(/\D/g, ''))}
            className={`${inputCls} tabular-nums`}
            placeholder={orc.carro?.kmAtual != null ? `último: ${orc.carro.kmAtual.toLocaleString('pt-BR')}` : 'Ex.: 85000'}
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
      <Campo label="Queixa do cliente (opcional)">
        <AreaTexto value={defeito} onChange={(e) => setDefeito(e.target.value)} rows={2} maxLength={1000} />
      </Campo>

      <ErroFormulario>{erros.geral}</ErroFormulario>
    </Modal>
  );
}

/** Só amarra o orçamento rápido a um cadastro (sem aprovar ainda). */
export function IdentificarOrcamento({ orc, onFechar, onPronto }: { orc: OrcamentoDTO; onFechar: () => void; onPronto: (o: OrcamentoDTO) => void }) {
  const qc = useQueryClient();
  const avisos = useAvisos();
  const [cliente, setCliente] = useState<ClienteEscolhido | null>(clienteDoOrcamento(orc));
  const [veiculoId, setVeiculoId] = useState<string | null>(orc.carroId);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  async function salvar() {
    const e: Record<string, string> = {};
    if (!cliente) e.cliente = 'Escolha ou cadastre o cliente';
    if (!veiculoId) e.veiculo = 'Escolha ou cadastre o veículo';
    setErros(e);
    if (Object.keys(e).length || !cliente || !veiculoId) return;
    setEnviando(true);
    try {
      const o = await http.patch<OrcamentoDTO>(`/orcamentos/${orc.id}/identificar`, { clienteId: cliente.id, carroId: veiculoId });
      qc.setQueryData(['orcamentos', o.id], o);
      await qc.invalidateQueries({ queryKey: ['orcamentos'] });
      avisos.sucesso(`Orçamento #${o.numero} agora é de ${o.cliente?.nome}.`);
      onPronto(o);
    } catch (err) {
      setErros({ geral: mensagemDeErro(err) });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      title={`Vincular o orçamento #${orc.numero} a um cliente`}
      size="lg"
      onClose={onFechar}
      onEnviar={() => void salvar()}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Voltar</BtnGhost>
          <BtnPrimary type="submit" disabled={enviando}>
            {enviando ? 'Salvando...' : 'Vincular'}
          </BtnPrimary>
        </>
      }
    >
      <p className="text-sm text-grafite/65">
        {orc.contatoNome || orc.veiculoDescricao
          ? `Anotado no orçamento: ${[orc.contatoNome, orc.veiculoDescricao].filter(Boolean).join(' · ')}. `
          : ''}
        Os itens e preços não mudam.
      </p>
      <SeletorClienteVeiculo
        cliente={cliente}
        onCliente={setCliente}
        veiculoId={veiculoId}
        onVeiculo={setVeiculoId}
        clienteFixo={!!orc.clienteId}
        erroCliente={erros.cliente}
        erroVeiculo={erros.veiculo}
        sugestao={{ nome: orc.contatoNome, telefone: orc.contatoTelefone, veiculo: orc.veiculoDescricao }}
      />
      <ErroFormulario>{erros.geral}</ErroFormulario>
    </Modal>
  );
}
