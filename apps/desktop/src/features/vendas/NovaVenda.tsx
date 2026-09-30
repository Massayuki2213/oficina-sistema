import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ShoppingBag } from 'lucide-react';
import { FORMAS_A_VISTA, LABEL_FORMA_PAGAMENTO, brl, subtrair, type ClienteResumoDTO, type FormaAVista, type VendaDTO } from '@hermes/shared';
import { ApiError, http, mensagemDeErro } from '../../api/http';
import { foiDesistencia, useConfirmacoes } from '../../api/acoes';
import { buscarClientes } from '../../api/catalogo';
import { useAvisos } from '../../lib/avisos';
import { formatarTelefone } from '../../lib/format';
import { useSessao } from '../acesso/sessao';
import { AreaTexto, BtnGhost, BtnPrimary, BuscaSelect, Campo, ErroFormulario, InputDinheiro, Modal } from '../../components/ui';
import { EditorItens, ITENS_VAZIOS, calcularTotais, itensInvalidos, itensParaEnvio, type Itens } from '../../components/EditorItens';

/** Venda de balcão: peça vendida sem OS (óleo, lâmpada, palheta...). Paga na hora. */
export function NovaVenda({ onFechar, onVendida }: { onFechar: () => void; onVendida: (v: VendaDTO) => void }) {
  const { pode } = useSessao();
  const qc = useQueryClient();
  const avisos = useAvisos();
  const confirmar = useConfirmacoes();
  const [cliente, setCliente] = useState<ClienteResumoDTO | null>(null);
  const [itens, setItens] = useState<Itens>(ITENS_VAZIOS);
  const [desconto, setDesconto] = useState('');
  const [forma, setForma] = useState<FormaAVista>('PIX');
  const [clienteDeu, setClienteDeu] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const totais = calcularTotais(itens, desconto);
  const troco = forma === 'A_VISTA' && clienteDeu ? subtrair(Number(clienteDeu), totais.total) : null;

  async function vender() {
    const problema = itensInvalidos(itens);
    if (problema) return setErro(problema);
    const { pecas } = itensParaEnvio(itens);
    const corpo = {
      clienteId: cliente?.id ?? null,
      itens: pecas,
      desconto: Number(desconto || 0),
      formaPagamento: forma,
      observacoes: observacoes.trim() || null,
    };
    setEnviando(true);
    setErro('');
    try {
      const v = await confirmar((x) => http.post<VendaDTO>('/vendas', { ...corpo, ...x }));
      await Promise.all([['vendas'], ['pecas'], ['alertas'], ['caixa'], ['relatorios']].map((queryKey) => qc.invalidateQueries({ queryKey })));
      avisos.sucesso(`Venda #${v.numero} registrada — ${brl(v.total)} no ${LABEL_FORMA_PAGAMENTO[v.formaPagamento]}.`);
      onVendida(v);
    } catch (e) {
      if (foiDesistencia(e)) return;
      setErro(e instanceof ApiError && e.erros ? Object.values(e.erros).map((m) => m[0]).join(' ') : mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      title="Venda de balcão"
      size="xl"
      onClose={onFechar}
      onEnviar={() => void vender()}
      footer={
        <>
          <span className="mr-auto self-center text-sm text-grafite/55">
            Total <strong className="text-lg text-petroleo tabular-nums ml-1">{brl(totais.total)}</strong>
          </span>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary type="submit" icone={ShoppingBag} disabled={enviando}>
            {enviando ? 'Registrando...' : 'Registrar venda'}
          </BtnPrimary>
        </>
      }
    >
      <EditorItens valor={itens} onChange={setItens} podeAlterarPreco={pode('darDesconto')} comServicos={false} />

      <div className="grid md:grid-cols-2 gap-4 items-start">
        <div className="space-y-3">
          <Campo label="Forma de pagamento">
            <div className="flex bg-fundo rounded-lg p-1 gap-1" role="radiogroup" aria-label="Forma de pagamento">
              {FORMAS_A_VISTA.map((f) => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={forma === f}
                  onClick={() => setForma(f)}
                  className={`flex-1 px-3 py-2 rounded-md text-sm font-bold transition ${forma === f ? 'bg-white text-petroleo shadow-sm' : 'text-grafite/55 hover:text-grafite'}`}
                >
                  {LABEL_FORMA_PAGAMENTO[f]}
                </button>
              ))}
            </div>
          </Campo>
          {forma === 'A_VISTA' && (
            <div className="flex items-end gap-3">
              <Campo label="Cliente entregou" className="w-44">
                <InputDinheiro value={clienteDeu} onChange={setClienteDeu} />
              </Campo>
              {troco !== null && (
                <div className={`text-sm font-bold pb-3 ${troco < 0 ? 'text-vermelho' : 'text-verde'}`}>
                  {troco < 0 ? `Faltam ${brl(-troco)}` : `Troco: ${brl(troco)}`}
                </div>
              )}
            </div>
          )}
          {pode('darDesconto') && (
            <Campo label="Desconto" className="w-44">
              <InputDinheiro value={desconto} onChange={setDesconto} />
            </Campo>
          )}
        </div>
        <div className="space-y-3">
          <Campo label="Cliente (opcional)" ajuda="Para a venda aparecer no histórico dele.">
            <BuscaSelect<ClienteResumoDTO>
              valor={cliente}
              onChange={setCliente}
              chave="clientes"
              buscar={buscarClientes}
              id={(c) => c.id}
              rotulo={(c) => c.nome}
              detalhe={(c) => formatarTelefone(c.telefone ?? c.whatsapp) || 'sem telefone'}
              placeholder="Nome, CPF ou telefone"
            />
          </Campo>
          <Campo label="Observações">
            <AreaTexto value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} maxLength={500} />
          </Campo>
        </div>
      </div>

      {totais.desconto > 0 && (
        <div className="text-right text-sm text-grafite/55">
          Subtotal <span className="tabular-nums font-semibold text-grafite">{brl(totais.subtotal)}</span> · desconto{' '}
          <span className="tabular-nums font-semibold text-vermelho">−{brl(totais.desconto)}</span>
        </div>
      )}
      <ErroFormulario>{erro}</ErroFormulario>
    </Modal>
  );
}
