import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Wand2 } from 'lucide-react';
import { LABEL_TIPO_ITEM_ESTOQUE, TIPOS_ITEM_ESTOQUE, arredondar, brl, type FornecedorDTO, type PecaDTO, type TipoItemEstoque } from '@hermes/shared';
import { ApiError, http, mensagemDeErro } from '../../api/http';
import { useOficina } from '../../api/catalogo';
import { useAvisos } from '../../lib/avisos';
import { numeroParaTexto, textoParaNumero } from '../../lib/mascaras';
import { BtnGhost, BtnPrimary, Campo, ErroFormulario, InputDinheiro, InputQuantidade, Modal, Selecao, inputCls } from '../../components/ui';

const UNIDADES = ['un', 'L', 'ml', 'm', 'kg', 'par', 'jogo', 'cx', 'kit'];

/** Cadastro da peça. A quantidade em estoque NÃO se edita aqui: só por entrada, saída ou inventário. */
export function FormPeca({
  peca,
  codigoInicial,
  onFechar,
  onSalva,
}: {
  peca: PecaDTO | null;
  codigoInicial?: string;
  onFechar: () => void;
  onSalva?: (p: PecaDTO) => void;
}) {
  const qc = useQueryClient();
  const avisos = useAvisos();
  const oficina = useOficina();
  const fornecedores = useQuery({ queryKey: ['fornecedores'], queryFn: () => http.get<FornecedorDTO[]>('/fornecedores') });

  const [nome, setNome] = useState(peca?.nome ?? '');
  const [tipo, setTipo] = useState<TipoItemEstoque>(peca?.tipo ?? 'PECA');
  const [codigoBarras, setCodigoBarras] = useState(peca?.codigoBarras ?? codigoInicial ?? '');
  const [sku, setSku] = useState(peca?.sku ?? '');
  const [fornecedorId, setFornecedorId] = useState(peca?.fornecedor?.id ?? '');
  const [custo, setCusto] = useState(peca?.precoCusto != null ? peca.precoCusto.toFixed(2) : '');
  const [venda, setVenda] = useState(peca ? peca.precoVenda.toFixed(2) : '');
  const [minimo, setMinimo] = useState(numeroParaTexto(peca?.estoqueMinimo ?? 0));
  const [unidade, setUnidade] = useState(peca?.unidade ?? 'un');
  const [localizacao, setLocalizacao] = useState(peca?.localizacao ?? '');
  const [inicial, setInicial] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  const custoN = Number(custo || 0);
  const vendaN = Number(venda || 0);
  const margem = custoN > 0 ? ((vendaN - custoN) / custoN) * 100 : null;

  async function salvar() {
    const corpo = {
      nome: nome.trim(),
      tipo,
      codigoBarras: codigoBarras.trim(),
      sku: sku.trim(),
      fornecedorId: fornecedorId || null,
      precoCusto: custoN,
      precoVenda: vendaN,
      estoqueMinimo: textoParaNumero(minimo) ?? 0,
      unidade: unidade.trim() || 'un',
      localizacao: localizacao.trim(),
      ...(peca ? {} : { estoqueInicial: textoParaNumero(inicial) ?? 0 }),
    };
    setEnviando(true);
    setErros({});
    try {
      const p = peca ? await http.put<PecaDTO>(`/pecas/${peca.id}`, { ...corpo, versao: peca.versao }) : await http.post<PecaDTO>('/pecas', corpo);
      await Promise.all([['pecas'], ['alertas'], ['fornecedores']].map((queryKey) => qc.invalidateQueries({ queryKey })));
      avisos.sucesso(peca ? `${p.nome} atualizada.` : `${p.nome} cadastrada.`);
      onSalva?.(p);
      onFechar();
    } catch (e) {
      if (e instanceof ApiError && e.erros) setErros(Object.fromEntries(Object.entries(e.erros).map(([k, v]) => [k, v[0]])));
      else setErros({ geral: mensagemDeErro(e) });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      title={peca ? `Editar ${peca.nome}` : 'Nova peça ou produto'}
      size="lg"
      onClose={onFechar}
      onEnviar={() => void salvar()}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary type="submit" disabled={enviando}>
            {enviando ? 'Salvando...' : 'Salvar'}
          </BtnPrimary>
        </>
      }
    >
      <div className="grid sm:grid-cols-[1fr_auto] gap-3">
        <Campo label="Nome" erro={erros.nome}>
          <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} maxLength={120} placeholder="Ex.: Óleo 5W30 sintético" />
        </Campo>
        <Campo label="Tipo">
          <Selecao value={tipo} onChange={(e) => setTipo(e.target.value as TipoItemEstoque)}>
            {TIPOS_ITEM_ESTOQUE.map((t) => (
              <option key={t} value={t}>
                {LABEL_TIPO_ITEM_ESTOQUE[t]}
              </option>
            ))}
          </Selecao>
        </Campo>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Campo label="Código de barras" erro={erros.codigoBarras} ajuda="Clique aqui e bipe o leitor.">
          <input value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} className={`${inputCls} font-mono`} maxLength={50} />
        </Campo>
        <Campo label="Código interno (SKU)" erro={erros.sku}>
          <input value={sku} onChange={(e) => setSku(e.target.value)} className={`${inputCls} font-mono`} maxLength={50} />
        </Campo>
        <Campo label="Prateleira / local" erro={erros.localizacao}>
          <input value={localizacao} onChange={(e) => setLocalizacao(e.target.value)} className={inputCls} maxLength={60} placeholder="Ex.: A3" />
        </Campo>
      </div>
      <Campo label="Distribuidor principal">
        <Selecao value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
          <option value="">— nenhum —</option>
          {(fornecedores.data ?? []).map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </Selecao>
      </Campo>
      <div className="grid sm:grid-cols-3 gap-3 items-start">
        <Campo label="Custo (unidade)" erro={erros.precoCusto} ajuda={peca ? 'É o custo médio: as entradas com custo o recalculam.' : undefined}>
          <InputDinheiro value={custo} onChange={setCusto} />
        </Campo>
        <Campo
          label="Preço de venda"
          erro={erros.precoVenda}
          ajuda={
            margem !== null ? (
              <span className={margem < 0 ? 'text-vermelho font-bold' : ''}>
                margem de {margem.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%{margem < 0 ? ' — vendendo com prejuízo' : ''}
              </span>
            ) : undefined
          }
        >
          <InputDinheiro value={venda} onChange={setVenda} />
        </Campo>
        <div className="sm:pt-6">
          <BtnGhost
            icone={Wand2}
            disabled={custoN <= 0}
            onClick={() => setVenda(arredondar(custoN * (1 + oficina.margemPadrao / 100)).toFixed(2))}
            titulo={`Custo + ${oficina.margemPadrao}% (margem padrão da oficina)`}
            className="w-full !px-3 text-sm"
          >
            Margem {oficina.margemPadrao}%{custoN > 0 ? ` = ${brl(arredondar(custoN * (1 + oficina.margemPadrao / 100)))}` : ''}
          </BtnGhost>
        </div>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Campo label="Unidade" erro={erros.unidade}>
          <input value={unidade} onChange={(e) => setUnidade(e.target.value)} className={inputCls} maxLength={10} list="unidades-peca" />
          <datalist id="unidades-peca">
            {UNIDADES.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </Campo>
        <Campo label="Estoque mínimo" erro={erros.estoqueMinimo} ajuda="Abaixo disso, entra no alerta de reposição.">
          <InputQuantidade value={minimo} onChange={setMinimo} />
        </Campo>
        {!peca && (
          <Campo label="Quantidade que já tem" erro={erros.estoqueInicial} ajuda="Contagem inicial na prateleira.">
            <InputQuantidade value={inicial} onChange={setInicial} />
          </Campo>
        )}
      </div>
      <ErroFormulario>{erros.geral}</ErroFormulario>
    </Modal>
  );
}
