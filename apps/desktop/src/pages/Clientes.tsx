import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { iniciais } from '../lib/format';
import { PageHeader, SearchBar, BtnPrimary, BtnGhost, Painel, Badge, Modal, Campo, inputCls, thCls, tdCls, VazioOuCarregando } from '../components/ui';

interface Cliente {
  id: string;
  nome: string;
  tipo: 'PF' | 'PJ';
  cpfCnpj: string | null;
  telefone: string | null;
  email: string | null;
  _count?: { carros: number };
}

export default function Clientes() {
  const { usuario } = useAuth();
  const ehDono = usuario?.perfil === 'DONO';
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState<Cliente | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function carregar(termo = '') {
    setCarregando(true);
    try {
      setClientes(await api<Cliente[]>(termo ? `/clientes?busca=${encodeURIComponent(termo)}` : '/clientes'));
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    carregar();
  }, []);

  async function excluir(c: Cliente) {
    if (!confirm(`Excluir o cliente "${c.nome}"? Ele sai da lista (o histórico de OS é preservado).`)) return;
    setOcupado(c.id);
    try {
      await api(`/clientes/${c.id}`, { method: 'DELETE' });
      await carregar(busca);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Erro ao excluir');
    } finally {
      setOcupado(null);
    }
  }

  const fecharForm = () => { setNovo(false); setEditar(null); };
  const aposSalvar = () => { fecharForm(); carregar(busca); };

  return (
    <div>
      <PageHeader title="Clientes" subtitle={`${clientes.length} cliente(s)`}>
        <SearchBar value={busca} onChange={setBusca} onSubmit={() => carregar(busca)} placeholder="Nome, CPF ou telefone..." />
        <BtnPrimary onClick={() => setNovo(true)}>+ Novo cliente</BtnPrimary>
      </PageHeader>

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Cliente</th>
              <th className={thCls}>Tipo</th>
              <th className={thCls}>CPF / CNPJ</th>
              <th className={thCls}>Telefone</th>
              <th className={thCls}>Veículos</th>
              <th className={`${thCls} text-right`}>Ações</th>
            </tr>
          </thead>
          <tbody>
            <VazioOuCarregando carregando={carregando} vazio={clientes.length === 0} colSpan={6} />
            {clientes.map((c) => (
              <tr key={c.id} className="border-b border-fundo last:border-0 hover:bg-fundo/40 transition">
                <td className={tdCls}>
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-full bg-petroleo text-white grid place-items-center text-xs font-bold">{iniciais(c.nome)}</span>
                    <span className="font-bold">{c.nome}</span>
                  </div>
                </td>
                <td className={tdCls}><Badge>{c.tipo}</Badge></td>
                <td className={`${tdCls} text-grafite/60`}>{c.cpfCnpj ?? '—'}</td>
                <td className={tdCls}>{c.telefone ?? '—'}</td>
                <td className={`${tdCls} font-semibold`}>{c._count?.carros ?? 0}</td>
                <td className={`${tdCls} text-right whitespace-nowrap`}>
                  <button onClick={() => setEditar(c)} className="text-grafite/50 hover:text-petroleo px-1.5" title="Editar">✏️</button>
                  {ehDono && (
                    <button onClick={() => excluir(c)} disabled={ocupado === c.id} className="text-grafite/30 hover:text-vermelho px-1.5 disabled:opacity-40" title="Excluir">🗑</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Painel>

      {(novo || editar) && <FormCliente cliente={editar} onFechar={fecharForm} onSalvo={aposSalvar} />}
    </div>
  );
}

function FormCliente({ cliente, onFechar, onSalvo }: { cliente: Cliente | null; onFechar: () => void; onSalvo: () => void }) {
  const editando = !!cliente;
  const [form, setForm] = useState({
    nome: cliente?.nome ?? '',
    tipo: cliente?.tipo ?? 'PF',
    cpfCnpj: cliente?.cpfCnpj ?? '',
    telefone: cliente?.telefone ?? '',
    email: cliente?.email ?? '',
  });
  const [erros, setErros] = useState<Record<string, string[]>>({});
  const [salvando, setSalvando] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function salvar() {
    setSalvando(true);
    setErros({});
    try {
      if (editando) await api(`/clientes/${cliente!.id}`, { method: 'PUT', body: form });
      else await api('/clientes', { method: 'POST', body: form });
      onSalvo();
    } catch (err) {
      if (err instanceof ApiError) setErros(err.erros ?? { nome: [err.message] });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title={editando ? 'Editar cliente' : 'Novo cliente'}
      onClose={onFechar}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Salvar cliente'}
          </BtnPrimary>
        </>
      }
    >
      <Campo label="Nome completo" erro={erros.nome?.[0]}>
        <input value={form.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex: Carlos Andrade" className={inputCls} />
      </Campo>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Tipo">
          <select value={form.tipo} onChange={(e) => set('tipo', e.target.value)} className={inputCls}>
            <option value="PF">Pessoa Física</option>
            <option value="PJ">Pessoa Jurídica</option>
          </select>
        </Campo>
        <Campo label="CPF / CNPJ" erro={erros.cpfCnpj?.[0]}>
          <input value={form.cpfCnpj} onChange={(e) => set('cpfCnpj', e.target.value)} className={inputCls} />
        </Campo>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Telefone" erro={erros.telefone?.[0]}>
          <input value={form.telefone} onChange={(e) => set('telefone', e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="E-mail" erro={erros.email?.[0]}>
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} />
        </Campo>
      </div>
    </Modal>
  );
}
