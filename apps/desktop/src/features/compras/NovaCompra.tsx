import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PackagePlus, Plus, X } from 'lucide-react';
import { FORMAS_SAIDA, LABEL_FORMA_PAGAMENTO, brl, multiplicar, somar, type CompraDTO, type FormaSaida, type FornecedorDTO, type PecaDTO } from '@hermes/shared';
import { ApiError, http, mensagemDeErro } from '../../api/http';
import { buscarPecas } from '../../api/catalogo';
import { useAvisos } from '../../lib/avisos';
import { daquiDias, hojeISO } from '../../lib/format';
import { textoParaNumero } from '../../lib/mascaras';
import { AreaTexto, BtnGhost, BtnPrimary, BuscaSelect, Campo, ErroFormulario, InputDinheiro, InputQuantidade, Modal, Selecao, inputCls } from '../../components/ui';
import { FormFornecedor } from '../distribuidores/FormFornecedor';

interface Linha {
  chave: number;
  peca: PecaDTO | null;
  /** Peça que ainda não existe no estoque: cadastrada junto com a compra. */
  nova: { nome: string; precoVenda: string; unidade: string; codigoBarras: string } | null;
  quantidade: string;
  custo: string;
}

let proximaChave = 1;
const linhaVazia = (nova = false): Linha => ({
  chave: proximaChave++,
  peca: null,
  nova: nova ? { nome: '', precoVenda: '', unidade: 'un', codigoBarras: '' } : null,
  quantidade: '1',
  custo: '',
});

export function NovaCompra({ onFechar, onCriada }: { onFechar: () => void; onCriada: (c: CompraDTO) => void }) {
  const qc = useQueryClient();
  const avisos = useAvisos();
  const fornecedores = useQuery({ queryKey: ['fornecedores'], queryFn: () => http.get<FornecedorDTO[]>('/fornecedores') });
  const [fornecedorId, setFornecedorId] = useState('');
  const [data, setData] = useState(hojeISO());
  const [nota, setNota] = useState('');
  const [pago, setPago] = useState(false);
  const [forma, setForma] = useState<FormaSaida>('PIX');
  const [vencimento, setVencimento] = useState(daquiDias(28));
  const [observacoes, setObservacoes] = useState('');
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [novoFornecedor, setNovoFornecedor] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const subtotal = (l: Linha) => multiplicar(Number(l.custo || 0), textoParaNumero(l.quantidade) ?? 0);
  const total = somar(...linhas.map(subtotal));
  const mudar = (chave: number, parte: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...parte } : l)));

  async function salvar() {
    if (!fornecedorId) return setErro('Escolha o distribuidor.');
    if (linhas.length === 0) return setErro('Adicione ao menos um item.');
    if (linhas.some((l) => l.nova && !l.nova.nome.trim())) return setErro('Dê um nome à peça nova.');
    if (linhas.some((l) => !l.peca && !l.nova)) return setErro('Há uma linha sem peça escolhida.');

    const corpo = {
      fornecedorId,
      data,
      numeroNota: nota.trim() || null,
      observacoes: observacoes.trim() || null,
      pago,
      formaPagamento: pago ? forma : null,
      vencimento: pago ? null : vencimento || null,
      itens: linhas.map((l) => ({
        pecaId: l.peca?.id ?? null,
        pecaNova: l.nova
          ? { nome: l.nova.nome.trim(), precoVenda: Number(l.nova.precoVenda || 0), unidade: l.nova.unidade || 'un', codigoBarras: l.nova.codigoBarras.trim() || null }
          : null,
        quantidade: textoParaNumero(l.quantidade) ?? 0,
        custoUnit: Number(l.custo || 0),
      })),
    };

    setEnviando(true);
    setErro('');
    try {
      const c = await http.post<CompraDTO>('/compras', corpo);
      await Promise.all([['compras'], ['pecas'], ['fornecedores'], ['alertas'], ['caixa'], ['relatorios']].map((queryKey) => qc.invalidateQueries({ queryKey })));
      avisos.sucesso(`Compra #${c.numero} registrada: ${c.qtdItens} item(ns) entraram no estoque.`);
      onCriada(c);
    } catch (e) {
      setErro(e instanceof ApiError && e.erros ? Object.values(e.erros).map((v) => v[0]).join(' ') : mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Modal
        title="Nova compra"
        size="xl"
        onClose={onFechar}
        onEnviar={() => void salvar()}
        footer={
          <>
            <span className="mr-auto self-center text-sm text-grafite/55">
              Total <strong className="text-lg text-petroleo tabular-nums ml-1">{brl(total)}</strong>
            </span>
            <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
            <BtnPrimary type="submit" icone={PackagePlus} disabled={enviando}>
              {enviando ? 'Registrando...' : 'Registrar compra'}
            </BtnPrimary>
          </>
        }
      >
        <div className="grid sm:grid-cols-[1fr_10rem_10rem] gap-3">
          <Campo label="Distribuidor">
            <div className="flex gap-2">
              <Selecao value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
                <option value="">— escolha —</option>
                {(fornecedores.data ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </Selecao>
              <BtnGhost onClick={() => setNovoFornecedor(true)} titulo="Cadastrar distribuidor" className="!px-3">
                <Plus size={16} />
              </BtnGhost>
            </div>
          </Campo>
          <Campo label="Data da compra">
            <input type="date" value={data} max={hojeISO()} onChange={(e) => setData(e.target.value)} className={inputCls} />
          </Campo>
          <Campo label="Nº da nota">
            <input value={nota} onChange={(e) => setNota(e.target.value)} className={inputCls} maxLength={60} />
          </Campo>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-bold text-grafite/55">Itens</div>
          {linhas.map((l) => (
            <div key={l.chave} className="border border-linha rounded-xl p-2.5 space-y-2">
              <div className="flex items-start gap-2 flex-wrap sm:flex-nowrap">
                <div className="flex-1 min-w-[14rem]">
                  {l.nova ? (
                    <input
                      value={l.nova.nome}
                      onChange={(e) => mudar(l.chave, { nova: { ...l.nova!, nome: e.target.value } })}
                      placeholder="Nome da peça nova"
                      className={inputCls}
                      autoFocus
                    />
                  ) : (
                    <BuscaSelect<PecaDTO>
                      valor={l.peca}
                      onChange={(p) => mudar(l.chave, { peca: p, custo: p?.precoCusto != null ? p.precoCusto.toFixed(2) : l.custo })}
                      chave="pecas"
                      buscar={buscarPecas}
                      id={(p) => p.id}
                      rotulo={(p) => p.nome}
                      detalhe={(p) => `estoque ${p.estoqueAtual} ${p.unidade}${p.precoCusto != null ? ` · custo médio ${brl(p.precoCusto)}` : ''}`}
                      placeholder="Peça (nome ou código)"
                      autoFocus
                    />
                  )}
                </div>
                <div className="w-24">
                  <InputQuantidade value={l.quantidade} onChange={(v) => mudar(l.chave, { quantidade: v })} ariaLabel="Quantidade" />
                </div>
                <div className="w-36">
                  <InputDinheiro value={l.custo} onChange={(v) => mudar(l.chave, { custo: v })} />
                </div>
                <div className="w-24 text-right font-bold tabular-nums text-sm pt-3">{brl(subtotal(l))}</div>
                <button type="button" onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))} className="text-grafite/30 hover:text-vermelho p-1 pt-3" aria-label="Tirar item">
                  <X size={16} />
                </button>
              </div>
              {l.nova && (
                <div className="grid sm:grid-cols-3 gap-2">
                  <Campo label="Preço de venda">
                    <InputDinheiro value={l.nova.precoVenda} onChange={(v) => mudar(l.chave, { nova: { ...l.nova!, precoVenda: v } })} />
                  </Campo>
                  <Campo label="Unidade">
                    <input value={l.nova.unidade} onChange={(e) => mudar(l.chave, { nova: { ...l.nova!, unidade: e.target.value } })} className={inputCls} maxLength={10} />
                  </Campo>
                  <Campo label="Código de barras">
                    <input
                      value={l.nova.codigoBarras}
                      onChange={(e) => mudar(l.chave, { nova: { ...l.nova!, codigoBarras: e.target.value } })}
                      className={`${inputCls} font-mono`}
                      maxLength={50}
                    />
                  </Campo>
                </div>
              )}
            </div>
          ))}
          <div className="flex gap-3 flex-wrap">
            <button type="button" onClick={() => setLinhas((ls) => [...ls, linhaVazia()])} className="text-sm font-bold text-laranja hover:underline inline-flex items-center gap-1">
              <Plus size={14} /> Peça do estoque
            </button>
            <button type="button" onClick={() => setLinhas((ls) => [...ls, linhaVazia(true)])} className="text-sm font-bold text-laranja hover:underline inline-flex items-center gap-1">
              <Plus size={14} /> Peça nova (cadastra junto)
            </button>
          </div>
          {linhas.length > 0 && <p className="text-xs text-grafite/45">Quantidade e custo por unidade, como na nota.</p>}
        </div>

        <div className="grid sm:grid-cols-2 gap-3 items-start">
          <div className="space-y-2">
            <div className="grid grid-cols-2 bg-fundo rounded-lg p-1 gap-1" role="radiogroup" aria-label="Pagamento">
              {[
                { v: false, r: 'A prazo (boleto)' },
                { v: true, r: 'Paga agora' },
              ].map((o) => (
                <button
                  key={o.r}
                  type="button"
                  role="radio"
                  aria-checked={pago === o.v}
                  onClick={() => setPago(o.v)}
                  className={`px-3 py-2 rounded-md text-sm font-bold transition ${pago === o.v ? 'bg-white text-petroleo shadow-sm' : 'text-grafite/55'}`}
                >
                  {o.r}
                </button>
              ))}
            </div>
            {pago ? (
              <Campo label="Forma">
                <Selecao value={forma} onChange={(e) => setForma(e.target.value as FormaSaida)}>
                  {FORMAS_SAIDA.map((f) => (
                    <option key={f} value={f}>
                      {LABEL_FORMA_PAGAMENTO[f]}
                    </option>
                  ))}
                </Selecao>
              </Campo>
            ) : (
              <Campo label="Vencimento do boleto">
                <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={inputCls} />
              </Campo>
            )}
          </div>
          <Campo label="Observações">
            <AreaTexto value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} maxLength={500} />
          </Campo>
        </div>
        <ErroFormulario>{erro}</ErroFormulario>
      </Modal>
      {novoFornecedor && <FormFornecedor fornecedor={null} onFechar={() => setNovoFornecedor(false)} onSalvo={(f) => setFornecedorId(f.id)} />}
    </>
  );
}
