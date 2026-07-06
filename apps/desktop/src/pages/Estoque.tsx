import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { brl } from '../lib/format';
import { useAuth } from '../lib/auth';
import { PageHeader, SearchBar, BtnPrimary, BtnGhost, Painel, Badge, Modal, Campo, AcaoEditar, AcaoExcluir, inputCls, thCls, tdCls, VazioOuCarregando } from '../components/ui';

interface Peca {
  id: string;
  nome: string;
  sku: string | null;
  codigoBarras: string | null;
  localizacao: string | null;
  precoCusto: number;
  precoVenda: number;
  margemPct: number | null;
  estoqueAtual: number;
  estoqueMinimo: number;
  unidade: string;
  estoqueBaixo: boolean;
}

export default function Estoque() {
  const { usuario } = useAuth();
  const podeGerenciar = usuario?.perfil === 'DONO';
  const [pecas, setPecas] = useState<Peca[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState<Peca | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function carregar(termo = '') {
    setCarregando(true);
    try {
      setPecas(await api<Peca[]>(termo ? `/pecas?busca=${encodeURIComponent(termo)}` : '/pecas'));
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    carregar();
  }, []);

  async function excluir(p: Peca) {
    if (!confirm(`Excluir a peça "${p.nome}"? Ela sai do estoque (o histórico é preservado).`)) return;
    setOcupado(p.id);
    try {
      await api(`/pecas/${p.id}`, { method: 'DELETE' });
      await carregar(busca);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Erro ao excluir');
    } finally {
      setOcupado(null);
    }
  }

  const fecharForm = () => { setNovo(false); setEditar(null); };
  const aposSalvar = () => { fecharForm(); carregar(busca); };
  const baixos = pecas.filter((p) => p.estoqueBaixo).length;

  return (
    <div>
      <PageHeader title="Estoque" subtitle={`${pecas.length} peça(s)${baixos ? ` · ${baixos} em falta` : ''}`}>
        <SearchBar value={busca} onChange={setBusca} onSubmit={() => carregar(busca)} placeholder="Nome, SKU ou código..." />
        {podeGerenciar && <BtnPrimary onClick={() => setNovo(true)}>+ Nova peça</BtnPrimary>}
      </PageHeader>

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Peça</th>
              <th className={thCls}>Código</th>
              <th className={thCls}>Custo</th>
              <th className={thCls}>Venda</th>
              <th className={thCls}>Margem</th>
              <th className={thCls}>Estoque</th>
              <th className={thCls}>Situação</th>
              {podeGerenciar && <th className={`${thCls} text-right`}>Ações</th>}
            </tr>
          </thead>
          <tbody>
            <VazioOuCarregando carregando={carregando} vazio={pecas.length === 0} colSpan={podeGerenciar ? 8 : 7} />
            {pecas.map((p) => (
              <tr key={p.id} className="border-b border-fundo last:border-0 hover:bg-fundo/40 transition">
                <td className={`${tdCls} font-bold`}>{p.nome}</td>
                <td className={`${tdCls} font-mono text-grafite/60`}>{p.codigoBarras ?? p.sku ?? '—'}</td>
                <td className={`${tdCls} text-grafite/60`}>{brl(p.precoCusto)}</td>
                <td className={`${tdCls} font-bold`}>{brl(p.precoVenda)}</td>
                <td className={tdCls}>{p.margemPct != null ? <span className="text-verde font-bold">+{p.margemPct}%</span> : '—'}</td>
                <td className={`${tdCls} font-bold`}>
                  {p.estoqueAtual} {p.unidade}
                </td>
                <td className={tdCls}>
                  {p.estoqueBaixo ? (
                    <Badge cor="bg-vermelho-bg text-vermelho">Baixo (mín {p.estoqueMinimo})</Badge>
                  ) : (
                    <Badge cor="bg-verde-bg text-verde">OK</Badge>
                  )}
                </td>
                {podeGerenciar && (
                  <td className={`${tdCls} text-right whitespace-nowrap`}>
                    <AcaoEditar onClick={() => setEditar(p)} />
                    <AcaoExcluir onClick={() => excluir(p)} disabled={ocupado === p.id} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Painel>

      {(novo || editar) && <FormPeca peca={editar} onFechar={fecharForm} onSalvo={aposSalvar} />}
    </div>
  );
}

function FormPeca({ peca, onFechar, onSalvo }: { peca: Peca | null; onFechar: () => void; onSalvo: () => void }) {
  const editando = !!peca;
  const [form, setForm] = useState({
    nome: peca?.nome ?? '',
    codigoBarras: peca?.codigoBarras ?? '',
    sku: peca?.sku ?? '',
    precoCusto: peca ? String(peca.precoCusto) : '',
    precoVenda: peca ? String(peca.precoVenda) : '',
    estoqueAtual: peca ? String(peca.estoqueAtual) : '0',
    estoqueMinimo: peca ? String(peca.estoqueMinimo) : '0',
    unidade: peca?.unidade ?? 'un',
    localizacao: peca?.localizacao ?? '',
  });
  const [erros, setErros] = useState<Record<string, string[]>>({});
  const [salvando, setSalvando] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const custo = parseFloat(form.precoCusto);
  const venda = parseFloat(form.precoVenda);
  const margem = custo > 0 && venda >= 0 ? Math.round(((venda - custo) / custo) * 100) : null;

  async function salvar() {
    setSalvando(true);
    setErros({});
    try {
      if (editando) await api(`/pecas/${peca!.id}`, { method: 'PUT', body: form });
      else await api('/pecas', { method: 'POST', body: form });
      onSalvo();
    } catch (err) {
      if (err instanceof ApiError) setErros(err.erros ?? { nome: [err.message] });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title={editando ? 'Editar peça' : 'Nova peça'}
      onClose={onFechar}
      footer={
        <>
          {margem != null && <span className="text-sm text-grafite/50 mr-auto self-center">Margem: <b className="text-verde">{margem}%</b></span>}
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Salvar peça'}
          </BtnPrimary>
        </>
      }
    >
      <Campo label="Nome da peça" erro={erros.nome?.[0]}>
        <input value={form.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex: Filtro de óleo" className={inputCls} />
      </Campo>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Código de barras" erro={erros.codigoBarras?.[0]}>
          <input value={form.codigoBarras} onChange={(e) => set('codigoBarras', e.target.value)} className={`${inputCls} font-mono`} />
        </Campo>
        <Campo label="SKU (interno)">
          <input value={form.sku} onChange={(e) => set('sku', e.target.value)} className={inputCls} />
        </Campo>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Custo (R$)" erro={erros.precoCusto?.[0]}>
          <input type="number" step="0.01" value={form.precoCusto} onChange={(e) => set('precoCusto', e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Venda (R$)" erro={erros.precoVenda?.[0]}>
          <input type="number" step="0.01" value={form.precoVenda} onChange={(e) => set('precoVenda', e.target.value)} className={inputCls} />
        </Campo>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Campo label="Estoque">
          <input type="number" value={form.estoqueAtual} onChange={(e) => set('estoqueAtual', e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Mínimo">
          <input type="number" value={form.estoqueMinimo} onChange={(e) => set('estoqueMinimo', e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Unidade">
          <input value={form.unidade} onChange={(e) => set('unidade', e.target.value)} className={inputCls} />
        </Campo>
      </div>
    </Modal>
  );
}
