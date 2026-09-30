import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { LABEL_TIPO_MOVIMENTO, brl, formatarQtd, somarQtd, type MovimentoEstoqueDTO, type Pagina, type PecaDTO } from '@hermes/shared';
import { ApiError, http, mensagemDeErro } from '../../api/http';
import { useAvisos } from '../../lib/avisos';
import { dataHoraBR } from '../../lib/format';
import { textoParaNumero } from '../../lib/mascaras';
import { useSessao } from '../acesso/sessao';
import { Badge, BtnGhost, BtnPrimary, Campo, ErroFormulario, EstadoTabela, InputDinheiro, InputQuantidade, Modal, Paginacao, inputCls, tdCls, thCls } from '../../components/ui';

const INVALIDAR = [['pecas'], ['alertas'], ['relatorios']];

function useInvalidarEstoque() {
  const qc = useQueryClient();
  return () => Promise.all(INVALIDAR.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

/** Chegou mercadoria (reposição, nota do distribuidor, leitor de código de barras). */
export function EntradaPeca({ peca, onFechar }: { peca: PecaDTO; onFechar: () => void }) {
  const { pode } = useSessao();
  const avisos = useAvisos();
  const invalidar = useInvalidarEstoque();
  const [qtd, setQtd] = useState('1');
  const [custo, setCusto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const q = textoParaNumero(qtd) ?? 0;

  async function salvar() {
    if (q <= 0) return setErro('Informe a quantidade que chegou.');
    setEnviando(true);
    try {
      const p = await http.post<PecaDTO>(`/pecas/${peca.id}/entrada`, {
        quantidade: q,
        custoUnit: custo ? Number(custo) : null,
        motivo: motivo.trim() || null,
      });
      await invalidar();
      avisos.sucesso(`+${formatarQtd(q, peca.unidade)} de ${peca.nome}. Agora: ${formatarQtd(p.estoqueAtual, p.unidade)}.`);
      onFechar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      title={`Entrada — ${peca.nome}`}
      onClose={onFechar}
      onEnviar={() => void salvar()}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary type="submit" disabled={enviando}>
            {enviando ? 'Salvando...' : 'Dar entrada'}
          </BtnPrimary>
        </>
      }
    >
      <div className="text-sm text-grafite/60">
        Em estoque agora: <strong className="text-petroleo">{formatarQtd(peca.estoqueAtual, peca.unidade)}</strong>
        {q > 0 && (
          <>
            {' '}
            → <strong className="text-verde">{formatarQtd(somarQtd(peca.estoqueAtual, q), peca.unidade)}</strong>
          </>
        )}
      </div>
      <Campo label={`Quantidade que chegou (${peca.unidade})`}>
        <InputQuantidade value={qtd} onChange={setQtd} ariaLabel="Quantidade" autoFocus />
      </Campo>
      {pode('alterarPrecoCusto') && (
        <Campo label="Custo por unidade nesta compra (opcional)" ajuda={`Recalcula o custo médio (hoje ${brl(peca.precoCusto ?? 0)}).`}>
          <InputDinheiro value={custo} onChange={setCusto} />
        </Campo>
      )}
      <Campo label="Observação (opcional)">
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputCls} maxLength={200} placeholder="Ex.: NF 1234 da Distribuidora X" />
      </Campo>
      <p className="text-xs text-grafite/50">Compra com nota e boleto? Lance em Compras: dá a entrada e já fica na conta a pagar.</p>
      <ErroFormulario>{erro}</ErroFormulario>
    </Modal>
  );
}

/** Inventário: o que foi CONTADO na prateleira vira o saldo; a diferença fica registrada. */
export function AjustePeca({ peca, onFechar }: { peca: PecaDTO; onFechar: () => void }) {
  const avisos = useAvisos();
  const invalidar = useInvalidarEstoque();
  const [contado, setContado] = useState('');
  const [motivo, setMotivo] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const n = textoParaNumero(contado);
  const diferenca = n !== null ? somarQtd(n, -peca.estoqueAtual) : null;

  async function salvar() {
    if (n === null) return setErros({ contado: 'Informe quanto foi contado.' });
    if (!motivo.trim()) return setErros({ motivo: 'Explique o motivo — fica no histórico da peça.' });
    setEnviando(true);
    try {
      const r = await http.post<{ diferenca: number; peca: PecaDTO }>(`/pecas/${peca.id}/ajuste`, { estoqueContado: n, motivo: motivo.trim() });
      await invalidar();
      avisos.sucesso(
        r.diferenca === 0 ? 'Contagem confere com o sistema.' : `Estoque acertado (${r.diferenca > 0 ? '+' : ''}${formatarQtd(r.diferenca, peca.unidade)}).`,
      );
      onFechar();
    } catch (e) {
      setErros({ geral: e instanceof ApiError && e.erros ? Object.values(e.erros).map((v) => v[0]).join(' ') : mensagemDeErro(e) });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      title={`Inventário — ${peca.nome}`}
      onClose={onFechar}
      onEnviar={() => void salvar()}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary type="submit" disabled={enviando}>
            {enviando ? 'Salvando...' : 'Acertar estoque'}
          </BtnPrimary>
        </>
      }
    >
      <div className="text-sm text-grafite/60">
        O sistema diz: <strong className="text-petroleo">{formatarQtd(peca.estoqueAtual, peca.unidade)}</strong>
        {diferenca !== null && diferenca !== 0 && (
          <span className={`font-bold ml-2 ${diferenca < 0 ? 'text-vermelho' : 'text-verde'}`}>
            diferença {diferenca > 0 ? '+' : ''}
            {formatarQtd(diferenca, peca.unidade)}
          </span>
        )}
      </div>
      <Campo label={`Quanto tem na prateleira (${peca.unidade})`} erro={erros.contado}>
        <InputQuantidade value={contado} onChange={setContado} ariaLabel="Quantidade contada" autoFocus />
      </Campo>
      <Campo label="Motivo" erro={erros.motivo}>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputCls} maxLength={200} placeholder="Ex.: inventário do mês, avaria, perda" />
      </Campo>
      <ErroFormulario>{erros.geral}</ErroFormulario>
    </Modal>
  );
}

/** Kardex: cada entrada e saída da peça, com o saldo depois dela. */
export function KardexPeca({ peca, onFechar }: { peca: PecaDTO; onFechar: () => void }) {
  const { pode } = useSessao();
  const [pagina, setPagina] = useState(1);
  const consulta = useQuery({
    queryKey: ['pecas', peca.id, 'movimentos', pagina],
    queryFn: () => http.get<Pagina<MovimentoEstoqueDTO>>(`/pecas/${peca.id}/movimentos`, { pagina, porPagina: 20 }),
    placeholderData: keepPreviousData,
  });
  const itens = consulta.data?.itens ?? [];
  const verCusto = pode('verCusto');

  return (
    <Modal title={`Movimentação — ${peca.nome}`} size="xl" onClose={onFechar} semConfirmarDescarte semFocoInicial footer={<BtnGhost onClick={onFechar}>Fechar</BtnGhost>}>
      <div className="text-sm text-grafite/60">
        Saldo atual: <strong className="text-petroleo">{formatarQtd(peca.estoqueAtual, peca.unidade)}</strong>
      </div>
      <div className="border border-linha rounded-xl overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Quando</th>
              <th className={thCls}>Movimento</th>
              <th className={`${thCls} text-right`}>Qtd.</th>
              <th className={`${thCls} text-right`}>Saldo</th>
              {verCusto && <th className={`${thCls} text-right`}>Custo</th>}
              <th className={thCls}>Origem</th>
            </tr>
          </thead>
          <tbody>
            <EstadoTabela carregando={consulta.isPending} erro={consulta.error} vazio={itens.length === 0} colSpan={verCusto ? 6 : 5} textoVazio="Nenhum movimento ainda." />
            {itens.map((m) => {
              const sinal = m.tipo === 'SAIDA' ? -m.quantidade : m.quantidade;
              return (
                <tr key={m.id} className="border-b border-fundo last:border-0">
                  <td className={`${tdCls} whitespace-nowrap text-grafite/60`}>{dataHoraBR(m.data)}</td>
                  <td className={tdCls}>
                    <Badge cor={m.tipo === 'ENTRADA' ? 'bg-verde-bg text-verde' : m.tipo === 'SAIDA' ? 'bg-azul-bg text-azul' : 'bg-amarelo-bg text-amarelo'}>
                      {LABEL_TIPO_MOVIMENTO[m.tipo]}
                    </Badge>
                    {m.motivo && <div className="text-xs text-grafite/50 mt-0.5">{m.motivo}</div>}
                  </td>
                  <td className={`${tdCls} text-right tabular-nums font-bold ${sinal < 0 ? 'text-vermelho' : 'text-verde'}`}>
                    {sinal > 0 ? '+' : ''}
                    {formatarQtd(sinal)}
                  </td>
                  <td className={`${tdCls} text-right tabular-nums`}>{m.saldoApos != null ? formatarQtd(m.saldoApos) : '—'}</td>
                  {verCusto && <td className={`${tdCls} text-right tabular-nums text-grafite/60`}>{m.custoUnit != null ? brl(m.custoUnit) : '—'}</td>}
                  <td className={`${tdCls} text-grafite/60 whitespace-nowrap`}>
                    {m.os ? (
                      <Link to={`/ordens?abrir=${m.os.id}`} className="font-bold hover:underline">
                        OS #{m.os.numero}
                      </Link>
                    ) : m.compra ? (
                      `Compra #${m.compra.numero}`
                    ) : m.venda ? (
                      `Venda #${m.venda.numero}`
                    ) : (
                      (m.usuario ?? '—')
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Paginacao pagina={pagina} porPagina={20} total={consulta.data?.total ?? 0} onPagina={setPagina} />
      </div>
    </Modal>
  );
}
