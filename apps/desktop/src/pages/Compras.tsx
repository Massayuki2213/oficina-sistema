import { useEffect, useState } from 'react';
import { Truck, HandCoins, PackagePlus, Trash2, Plus } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAvisos } from '../lib/avisos';
import { brl, dataBR } from '../lib/format';
import { queryPeriodo, type PeriodoKey } from '../lib/periodo';
import { PageHeader, Painel, Badge, Modal, Campo, BtnPrimary, BtnGhost, Kpi, Periodo, InputDinheiro, inputCls, thCls, tdCls, VazioOuCarregando } from '../components/ui';

interface CompraLista {
  id: string;
  numero: number;
  data: string;
  numeroNota: string | null;
  valorTotal: number;
  status: 'PENDENTE' | 'PAGA';
  fornecedor?: { id: string; nome: string };
  _count?: { itens: number };
}
interface Totais {
  total: number;
  aPagar: number;
  pago: number;
}
interface APagar {
  totalAPagar: number;
  fornecedores: {
    fornecedor: { id: string; nome: string };
    totalDevido: number;
    compras: number;
    compraMaisAntiga: string;
  }[];
}

export default function Compras() {
  const { usuario, podeVerFinanceiro } = useAuth();
  const avisos = useAvisos();
  const ehDono = usuario?.perfil === 'DONO';
  const [periodo, setPeriodo] = useState<PeriodoKey>('mes');
  const [compras, setCompras] = useState<CompraLista[]>([]);
  const [totais, setTotais] = useState<Totais>({ total: 0, aPagar: 0, pago: 0 });
  const [aPagar, setAPagar] = useState<APagar>({ totalAPagar: 0, fornecedores: [] });
  const [carregando, setCarregando] = useState(true);
  const [nova, setNova] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const r = await api<{ compras: CompraLista[]; totais: Totais }>(`/compras${queryPeriodo(periodo)}`);
      setCompras(r.compras);
      setTotais(r.totais);
      if (podeVerFinanceiro) setAPagar(await api<APagar>('/compras/a-pagar'));
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    carregar();
  }, [periodo]);

  async function pagar(c: CompraLista) {
    const ok = await avisos.confirmar({
      titulo: `Pagar compra #${c.numero}`,
      mensagem: `${brl(c.valorTotal)} para ${c.fornecedor?.nome ?? 'o distribuidor'} — a saída é lançada no caixa.`,
      botao: 'Pagar',
    });
    if (!ok) return;
    setOcupado(c.id);
    try {
      await api(`/compras/${c.id}/pagar`, { method: 'PATCH' });
      avisos.sucesso(`Compra #${c.numero} paga — ${brl(c.valorTotal)} saiu do caixa.`);
      await carregar();
    } catch (err) {
      avisos.erro(err instanceof ApiError ? err.message : 'Erro ao pagar');
    } finally {
      setOcupado(null);
    }
  }

  async function acertar(fornecedorId: string, nome: string, total: number) {
    const ok = await avisos.confirmar({
      titulo: `Acertar com ${nome}`,
      mensagem: `Quita todas as compras em aberto (${brl(total)}) de uma vez. A saída vai para o caixa.`,
      botao: 'Acertar tudo',
    });
    if (!ok) return;
    setOcupado(fornecedorId);
    try {
      const r = await api<{ quitadas: number; total: number }>(`/compras/acerto/${fornecedorId}`, { method: 'POST' });
      avisos.sucesso(`Acerto com ${nome}: ${r.quitadas} compra(s), ${brl(r.total)} no caixa.`);
      await carregar();
    } catch (err) {
      avisos.erro(err instanceof ApiError ? err.message : 'Erro no acerto');
    } finally {
      setOcupado(null);
    }
  }

  async function excluir(c: CompraLista) {
    const ok = await avisos.confirmar({
      titulo: `Excluir compra #${c.numero}`,
      mensagem: 'A compra é apagada e o estoque que ela deu entrada é estornado.',
      botao: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    setOcupado(c.id);
    try {
      await api(`/compras/${c.id}`, { method: 'DELETE' });
      avisos.sucesso(`Compra #${c.numero} excluída (estoque estornado).`);
      await carregar();
    } catch (err) {
      avisos.erro(err instanceof ApiError ? err.message : 'Erro ao excluir');
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div>
      <PageHeader title="Compras" subtitle="Peças compradas dos distribuidores">
        <Periodo value={periodo} onChange={setPeriodo} />
        <BtnPrimary onClick={() => setNova(true)}>+ Nova compra</BtnPrimary>
      </PageHeader>

      {podeVerFinanceiro && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Kpi label="A pagar (total)" valor={brl(aPagar.totalAPagar)} icon={HandCoins} cor="bg-amarelo-bg text-amarelo" sub={`${aPagar.fornecedores.length} distribuidor(es)`} />
          <Kpi label="Comprado no período" valor={brl(totais.total)} icon={Truck} />
          <Kpi label="Já pago no período" valor={brl(totais.pago)} cor="bg-verde-bg text-verde" />
        </div>
      )}

      {/* A pagar por distribuidor + acerto */}
      {podeVerFinanceiro && aPagar.fornecedores.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-bold text-grafite/50 mb-2">A pagar por distribuidor</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {aPagar.fornecedores.map((f) => (
              <div key={f.fornecedor.id} className="bg-white rounded-2xl border border-linha shadow-sm p-4">
                <div className="font-bold text-petroleo">{f.fornecedor.nome}</div>
                <div className="text-2xl font-extrabold text-amarelo mt-1">{brl(f.totalDevido)}</div>
                <div className="text-xs text-grafite/50 mt-0.5">
                  {f.compras} compra(s) · mais antiga {dataBR(f.compraMaisAntiga)}
                </div>
                <button
                  onClick={() => acertar(f.fornecedor.id, f.fornecedor.nome, f.totalDevido)}
                  disabled={ocupado === f.fornecedor.id}
                  className="mt-3 w-full inline-flex items-center justify-center gap-1.5 bg-petroleo hover:bg-petroleo-deep disabled:opacity-60 text-white font-bold text-sm px-3 py-2 rounded-xl transition"
                >
                  <HandCoins size={15} /> Acertar tudo
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Nº</th>
              <th className={thCls}>Data</th>
              <th className={thCls}>Distribuidor</th>
              <th className={thCls}>Nota</th>
              <th className={thCls}>Itens</th>
              <th className={`${thCls} text-right`}>Valor</th>
              <th className={thCls}>Status</th>
              <th className={`${thCls} text-right`}>Ações</th>
            </tr>
          </thead>
          <tbody>
            <VazioOuCarregando carregando={carregando} vazio={compras.length === 0} colSpan={8} />
            {compras.map((c) => (
              <tr key={c.id} className="border-b border-fundo last:border-0 hover:bg-fundo/40 transition">
                <td className={`${tdCls} font-mono font-bold text-grafite/60`}>#{c.numero}</td>
                <td className={`${tdCls} text-grafite/60 whitespace-nowrap`}>{dataBR(c.data)}</td>
                <td className={`${tdCls} font-bold`}>{c.fornecedor?.nome ?? '—'}</td>
                <td className={`${tdCls} text-grafite/60`}>{c.numeroNota ?? '—'}</td>
                <td className={tdCls}>{c._count?.itens ?? 0}</td>
                <td className={`${tdCls} text-right font-extrabold tabular-nums`}>{brl(c.valorTotal)}</td>
                <td className={tdCls}>
                  {c.status === 'PAGA' ? (
                    <Badge cor="bg-verde-bg text-verde">Paga</Badge>
                  ) : (
                    <Badge cor="bg-amarelo-bg text-amarelo">Em aberto</Badge>
                  )}
                </td>
                <td className={`${tdCls} text-right whitespace-nowrap`}>
                  {c.status === 'PENDENTE' && podeVerFinanceiro && (
                    <button
                      onClick={() => pagar(c)}
                      disabled={ocupado === c.id}
                      className="bg-verde/10 text-verde font-bold px-3 py-1.5 rounded-lg hover:bg-verde/20 disabled:opacity-50 transition whitespace-nowrap text-sm"
                    >
                      Pagar
                    </button>
                  )}
                  {c.status === 'PENDENTE' && ehDono && (
                    <button
                      onClick={() => excluir(c)}
                      disabled={ocupado === c.id}
                      title="Excluir"
                      className="text-grafite/40 hover:text-vermelho p-1.5 rounded-lg hover:bg-fundo disabled:opacity-40 transition ml-1 align-middle"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Painel>

      {nova && (
        <NovaCompra
          onFechar={() => setNova(false)}
          onSalvo={(n) => {
            setNova(false);
            avisos.sucesso(`Compra #${n} registrada — estoque atualizado.`);
            carregar();
          }}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------
// Nova compra: distribuidor + itens (peça existente ou nova) + entrada no estoque.
// ------------------------------------------------------------------
interface FornecedorOpt {
  id: string;
  nome: string;
}
interface PecaOpt {
  id: string;
  nome: string;
  precoCusto: number;
  precoVenda: number;
  unidade: string;
}
interface LinhaItem {
  key: string;
  pecaId?: string; // vazio = peça nova
  nome: string;
  precoVendaNova: string; // só para peça nova
  quantidade: number;
  custoUnit: string; // string de dinheiro ("12.50")
}

let seq = 0;

function NovaCompra({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: (numero: number) => void }) {
  const [fornecedores, setFornecedores] = useState<FornecedorOpt[]>([]);
  const [catPec, setCatPec] = useState<PecaOpt[]>([]);
  const [fornecedorId, setFornecedorId] = useState('');
  const [numeroNota, setNumeroNota] = useState('');
  const [pago, setPago] = useState(false);
  const [observacoes, setObservacoes] = useState('');
  const [itens, setItens] = useState<LinhaItem[]>([]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api<FornecedorOpt[]>('/fornecedores').then(setFornecedores).catch(() => {});
    api<PecaOpt[]>('/pecas').then(setCatPec).catch(() => {});
  }, []);

  function addExistente(id: string) {
    const p = catPec.find((x) => x.id === id);
    if (!p || itens.some((i) => i.pecaId === id)) return;
    setItens((l) => [...l, { key: `k${seq++}`, pecaId: p.id, nome: p.nome, precoVendaNova: '', quantidade: 1, custoUnit: String(p.precoCusto) }]);
  }
  function addNova() {
    setItens((l) => [...l, { key: `k${seq++}`, pecaId: undefined, nome: '', precoVendaNova: '', quantidade: 1, custoUnit: '' }]);
  }
  const upd = (key: string, campo: Partial<LinhaItem>) => setItens((l) => l.map((i) => (i.key === key ? { ...i, ...campo } : i)));
  const remover = (key: string) => setItens((l) => l.filter((i) => i.key !== key));

  const total = itens.reduce((s, i) => s + (Number(i.custoUnit) || 0) * i.quantidade, 0);

  async function salvar() {
    setErro('');
    if (!fornecedorId) return setErro('Selecione o distribuidor.');
    if (itens.length === 0) return setErro('Adicione ao menos um item.');
    for (const i of itens) {
      if (!i.pecaId && !i.nome.trim()) return setErro('Dê um nome para a peça nova.');
      if (!i.pecaId && !(Number(i.precoVendaNova) > 0)) return setErro(`Informe o preço de venda de "${i.nome || 'peça nova'}".`);
      if (!(Number(i.custoUnit) >= 0) || i.custoUnit === '') return setErro(`Informe o custo de "${i.nome || 'um item'}".`);
    }

    setSalvando(true);
    try {
      const body = {
        fornecedorId,
        numeroNota,
        pago,
        observacoes,
        itens: itens.map((i) =>
          i.pecaId
            ? { pecaId: i.pecaId, quantidade: i.quantidade, custoUnit: Number(i.custoUnit) }
            : { pecaNova: { nome: i.nome.trim(), precoVenda: Number(i.precoVendaNova) }, quantidade: i.quantidade, custoUnit: Number(i.custoUnit) },
        ),
      };
      const criada = await api<{ numero: number }>('/compras', { method: 'POST', body });
      onSalvo(criada.numero);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Erro ao salvar a compra');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title="Nova compra"
      size="lg"
      onClose={onFechar}
      footer={
        <>
          <div className="mr-auto text-sm text-grafite/60 self-center">
            Total <b className="text-petroleo text-base">{brl(total)}</b>
          </div>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Registrar compra'}
          </BtnPrimary>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Distribuidor">
          <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} className={inputCls}>
            <option value="">Selecione...</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </select>
        </Campo>
        <Campo label="Nº da nota (opcional)">
          <input value={numeroNota} onChange={(e) => setNumeroNota(e.target.value)} placeholder="Ex: 10457" className={inputCls} />
        </Campo>
      </div>

      {/* Itens */}
      <div>
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <label className="text-xs font-bold text-grafite/50">Produtos comprados</label>
          <div className="ml-auto flex items-center gap-2">
            <select
              value=""
              onChange={(e) => addExistente(e.target.value)}
              className="text-sm border border-linha rounded-lg px-2 py-1 outline-none focus:border-laranja max-w-[13rem]"
            >
              <option value="">+ peça do estoque</option>
              {catPec.filter((p) => !itens.some((i) => i.pecaId === p.id)).map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
            <button onClick={addNova} className="inline-flex items-center gap-1 text-sm font-bold text-laranja hover:text-laranja-deep px-2 py-1 rounded-lg hover:bg-fundo transition">
              <PackagePlus size={15} /> Peça nova
            </button>
          </div>
        </div>

        {itens.length === 0 ? (
          <div className="text-sm text-grafite/40 border border-dashed border-linha rounded-lg py-4 text-center">
            Nenhum item. Use "+ peça do estoque" ou "Peça nova".
          </div>
        ) : (
          <div className="space-y-2">
            {itens.map((i) => (
              <div key={i.key} className="border border-linha rounded-lg p-2.5">
                <div className="flex items-center gap-2">
                  {i.pecaId ? (
                    <span className="font-bold text-sm flex-1 truncate">{i.nome}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 shrink-0">
                      <Plus size={13} className="text-laranja" />
                      <input
                        value={i.nome}
                        onChange={(e) => upd(i.key, { nome: e.target.value })}
                        placeholder="Nome da peça nova"
                        className="text-sm border border-linha rounded-lg px-2 py-1 outline-none focus:border-laranja w-44"
                      />
                    </span>
                  )}
                  <div className="flex-1" />
                  <button onClick={() => remover(i.key)} className="text-grafite/30 hover:text-vermelho text-lg leading-none px-1" title="Remover">×</button>
                </div>

                <div className="flex items-end gap-2 mt-2 flex-wrap">
                  <label className="text-[11px] text-grafite/50 font-bold">
                    Qtd
                    <input
                      type="number"
                      min={1}
                      value={i.quantidade}
                      onChange={(e) => upd(i.key, { quantidade: Math.max(1, Number(e.target.value)) })}
                      className="block w-16 mt-0.5 px-2 py-1.5 border border-linha rounded-lg text-center outline-none focus:border-laranja"
                    />
                  </label>
                  <label className="text-[11px] text-grafite/50 font-bold w-32">
                    Custo unit.
                    <div className="mt-0.5"><InputDinheiro value={i.custoUnit} onChange={(v) => upd(i.key, { custoUnit: v })} /></div>
                  </label>
                  {!i.pecaId && (
                    <label className="text-[11px] text-grafite/50 font-bold w-32">
                      Preço de venda
                      <div className="mt-0.5"><InputDinheiro value={i.precoVendaNova} onChange={(v) => upd(i.key, { precoVendaNova: v })} /></div>
                    </label>
                  )}
                  <div className="ml-auto text-right">
                    <div className="text-[11px] text-grafite/50 font-bold">Subtotal</div>
                    <div className="font-bold tabular-nums text-sm">{brl((Number(i.custoUnit) || 0) * i.quantidade)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Campo label="Observações">
        <input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Ex: entrega parcial, falta 1 item" className={inputCls} />
      </Campo>

      <label className="flex items-center gap-2.5 bg-fundo rounded-xl px-3.5 py-2.5 cursor-pointer">
        <input type="checkbox" checked={pago} onChange={(e) => setPago(e.target.checked)} className="w-4 h-4 accent-laranja" />
        <span className="text-sm font-semibold text-grafite">
          Já foi paga (à vista) — sai do caixa agora
          <span className="block text-xs text-grafite/50 font-normal">Deixe desmarcado para comprar a prazo (fica em "a pagar").</span>
        </span>
      </label>

      {erro && <div className="text-vermelho text-sm font-semibold">{erro}</div>}
    </Modal>
  );
}
