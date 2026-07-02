import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { iniciais } from '../lib/format';

interface Cliente {
  id: string;
  nome: string;
  tipo: 'PF' | 'PJ';
  cpfCnpj: string | null;
  telefone: string | null;
  _count?: { carros: number };
}

export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState(false);

  async function carregar(termo = '') {
    setCarregando(true);
    try {
      const url = termo ? `/clientes?busca=${encodeURIComponent(termo)}` : '/clientes';
      setClientes(await api<Cliente[]>(url));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <div>
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-petroleo">Clientes</h1>
          <p className="text-grafite/50 text-sm mt-0.5">{clientes.length} cliente(s)</p>
        </div>
        <div className="flex-1" />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            carregar(busca);
          }}
          className="flex items-center gap-2 bg-white border border-linha rounded-xl px-3.5 py-2.5 w-full max-w-xs focus-within:border-laranja"
        >
          <span className="text-grafite/40">🔍</span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar nome, CPF ou telefone..."
            className="flex-1 outline-none text-sm bg-transparent"
          />
        </form>
        <button
          onClick={() => setModal(true)}
          className="bg-laranja hover:bg-laranja-deep text-white font-bold px-4 py-2.5 rounded-xl shadow-md shadow-laranja/25 transition"
        >
          + Novo cliente
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-linha shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-grafite/50 border-b border-linha">
              <th className="px-4 py-3 font-bold">Cliente</th>
              <th className="px-4 py-3 font-bold">Tipo</th>
              <th className="px-4 py-3 font-bold">CPF / CNPJ</th>
              <th className="px-4 py-3 font-bold">Telefone</th>
              <th className="px-4 py-3 font-bold">Veículos</th>
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr>
                <td colSpan={5} className="text-center text-grafite/40 py-10 text-sm">
                  Carregando...
                </td>
              </tr>
            )}
            {!carregando && clientes.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-grafite/40 py-10 text-sm">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
            {clientes.map((c) => (
              <tr key={c.id} className="border-b border-fundo last:border-0 hover:bg-fundo/40 transition">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-full bg-petroleo text-white grid place-items-center text-xs font-bold">
                      {iniciais(c.nome)}
                    </span>
                    <span className="font-bold text-sm">{c.nome}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-linha text-grafite/60">{c.tipo}</span>
                </td>
                <td className="px-4 py-3 text-sm text-grafite/60">{c.cpfCnpj ?? '—'}</td>
                <td className="px-4 py-3 text-sm">{c.telefone ?? '—'}</td>
                <td className="px-4 py-3 text-sm font-semibold">{c._count?.carros ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && <NovoCliente onFechar={() => setModal(false)} onSalvo={() => { setModal(false); carregar(); }} />}
    </div>
  );
}

function NovoCliente({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const [form, setForm] = useState({ nome: '', tipo: 'PF', cpfCnpj: '', telefone: '', email: '' });
  const [erros, setErros] = useState<Record<string, string[]>>({});
  const [salvando, setSalvando] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function salvar() {
    setSalvando(true);
    setErros({});
    try {
      await api('/clientes', { method: 'POST', body: form });
      onSalvo();
    } catch (err) {
      if (err instanceof ApiError && err.erros) setErros(err.erros);
      else if (err instanceof ApiError) setErros({ nome: [err.message] });
    } finally {
      setSalvando(false);
    }
  }

  const Campo = (label: string, k: keyof typeof form, tipo = 'text') => (
    <div>
      <label className="block text-xs font-bold text-grafite/50 mb-1.5">{label}</label>
      <input
        type={tipo}
        value={form[k]}
        onChange={(e) => set(k, e.target.value)}
        className="w-full px-3 py-2.5 border-[1.6px] border-linha rounded-lg outline-none focus:border-laranja"
      />
      {erros[k] && <div className="text-vermelho text-xs mt-1">{erros[k][0]}</div>}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-petroleo/50 grid place-items-center p-5 z-50" onClick={onFechar}>
      <div className="bg-white rounded-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center px-6 py-5 border-b border-linha">
          <h3 className="text-lg font-extrabold text-petroleo">Novo cliente</h3>
          <button onClick={onFechar} className="ml-auto text-2xl text-grafite/40 hover:text-grafite w-8 h-8">
            ×
          </button>
        </div>
        <div className="p-6 space-y-3.5">
          {Campo('Nome completo', 'nome')}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-grafite/50 mb-1.5">Tipo</label>
              <select
                value={form.tipo}
                onChange={(e) => set('tipo', e.target.value)}
                className="w-full px-3 py-2.5 border-[1.6px] border-linha rounded-lg outline-none focus:border-laranja"
              >
                <option value="PF">PF</option>
                <option value="PJ">PJ</option>
              </select>
            </div>
            {Campo('CPF / CNPJ', 'cpfCnpj')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {Campo('Telefone', 'telefone')}
            {Campo('E-mail', 'email', 'email')}
          </div>
        </div>
        <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-linha">
          <button onClick={onFechar} className="px-4 py-2.5 rounded-xl border-[1.6px] border-linha font-bold text-petroleo hover:bg-fundo">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            className="px-4 py-2.5 rounded-xl bg-laranja hover:bg-laranja-deep disabled:opacity-60 text-white font-bold shadow-md shadow-laranja/25"
          >
            {salvando ? 'Salvando...' : 'Salvar cliente'}
          </button>
        </div>
      </div>
    </div>
  );
}
