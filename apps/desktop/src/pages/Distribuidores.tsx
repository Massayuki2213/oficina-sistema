import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAvisos } from '../lib/avisos';
import { brl } from '../lib/format';
import { mascaraCpfCnpj, mascaraTelefone } from '../lib/mascaras';
import { PageHeader, SearchBar, BtnPrimary, BtnGhost, Painel, Badge, Modal, Campo, AcaoEditar, AcaoExcluir, inputCls, thCls, tdCls, VazioOuCarregando } from '../components/ui';

interface Distribuidor {
  id: string;
  nome: string;
  cnpj: string | null;
  contato: string | null;
  telefone: string | null;
  prazoEntrega: number | null;
  observacoes: string | null;
  deve: number;
  comprasAbertas: number;
}

export default function Distribuidores() {
  const { usuario } = useAuth();
  const avisos = useAvisos();
  const ehDono = usuario?.perfil === 'DONO';
  const [lista, setLista] = useState<Distribuidor[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState<Distribuidor | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      setLista(await api<Distribuidor[]>('/fornecedores'));
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    carregar();
  }, []);

  const filtrados = lista.filter((f) => f.nome.toLowerCase().includes(busca.toLowerCase()));

  async function excluir(f: Distribuidor) {
    const ok = await avisos.confirmar({
      titulo: 'Excluir distribuidor',
      mensagem: `"${f.nome}" será removido do cadastro.`,
      botao: 'Excluir',
      perigo: true,
    });
    if (!ok) return;

    setOcupado(f.id);
    try {
      await api(`/fornecedores/${f.id}`, { method: 'DELETE' });
      avisos.sucesso(`Distribuidor "${f.nome}" excluído.`);
      await carregar();
    } catch (err) {
      avisos.erro(err instanceof ApiError ? err.message : 'Erro ao excluir');
    } finally {
      setOcupado(null);
    }
  }

  const fechar = () => {
    setNovo(false);
    setEditar(null);
  };
  const aposSalvar = (nome: string) => {
    avisos.sucesso(editar ? `Distribuidor "${nome}" atualizado.` : `Distribuidor "${nome}" cadastrado.`);
    fechar();
    carregar();
  };

  return (
    <div>
      <PageHeader title="Distribuidores" subtitle={`${lista.length} loja(s) de peças`}>
        <SearchBar value={busca} onChange={setBusca} onSubmit={() => {}} placeholder="Nome do distribuidor..." />
        <BtnPrimary onClick={() => setNovo(true)}>+ Novo distribuidor</BtnPrimary>
      </PageHeader>

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Distribuidor</th>
              <th className={thCls}>CNPJ</th>
              <th className={thCls}>Contato</th>
              <th className={thCls}>Telefone</th>
              <th className={thCls}>Prazo</th>
              <th className={`${thCls} text-right`}>Devo</th>
              <th className={`${thCls} text-right`}>Ações</th>
            </tr>
          </thead>
          <tbody>
            <VazioOuCarregando carregando={carregando} vazio={filtrados.length === 0} colSpan={7} />
            {filtrados.map((f) => (
              <tr key={f.id} className="border-b border-fundo last:border-0 hover:bg-fundo/40 transition">
                <td className={`${tdCls} font-bold`}>{f.nome}</td>
                <td className={`${tdCls} text-grafite/60`}>{f.cnpj ?? '—'}</td>
                <td className={tdCls}>{f.contato ?? '—'}</td>
                <td className={tdCls}>{f.telefone ?? '—'}</td>
                <td className={tdCls}>{f.prazoEntrega != null ? `${f.prazoEntrega} dia(s)` : '—'}</td>
                <td className={`${tdCls} text-right`}>
                  {f.deve > 0 ? (
                    <Badge cor="bg-amarelo-bg text-amarelo">{brl(f.deve)}</Badge>
                  ) : (
                    <span className="text-grafite/30">—</span>
                  )}
                </td>
                <td className={`${tdCls} text-right whitespace-nowrap`}>
                  <AcaoEditar onClick={() => setEditar(f)} />
                  {ehDono && <AcaoExcluir onClick={() => excluir(f)} disabled={ocupado === f.id} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Painel>

      {(novo || editar) && <FormDistribuidor distribuidor={editar} onFechar={fechar} onSalvo={aposSalvar} />}
    </div>
  );
}

function FormDistribuidor({ distribuidor, onFechar, onSalvo }: { distribuidor: Distribuidor | null; onFechar: () => void; onSalvo: (nome: string) => void }) {
  const editando = !!distribuidor;
  const [form, setForm] = useState({
    nome: distribuidor?.nome ?? '',
    cnpj: mascaraCpfCnpj(distribuidor?.cnpj ?? ''),
    contato: distribuidor?.contato ?? '',
    telefone: mascaraTelefone(distribuidor?.telefone ?? ''),
    prazoEntrega: distribuidor?.prazoEntrega != null ? String(distribuidor.prazoEntrega) : '',
    observacoes: distribuidor?.observacoes ?? '',
  });
  const [erros, setErros] = useState<Record<string, string[]>>({});
  const [salvando, setSalvando] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function salvar() {
    setSalvando(true);
    setErros({});
    try {
      if (editando) await api(`/fornecedores/${distribuidor!.id}`, { method: 'PUT', body: form });
      else await api('/fornecedores', { method: 'POST', body: form });
      onSalvo(form.nome);
    } catch (err) {
      if (err instanceof ApiError) setErros(err.erros ?? { nome: [err.message] });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title={editando ? 'Editar distribuidor' : 'Novo distribuidor'}
      onClose={onFechar}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Salvar distribuidor'}
          </BtnPrimary>
        </>
      }
    >
      <Campo label="Nome do distribuidor" erro={erros.nome?.[0]}>
        <input value={form.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex: Distribuidora Auto Sul" className={inputCls} />
      </Campo>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="CNPJ" erro={erros.cnpj?.[0]}>
          <input value={form.cnpj} onChange={(e) => set('cnpj', mascaraCpfCnpj(e.target.value))} inputMode="numeric" placeholder="00.000.000/0000-00" className={inputCls} />
        </Campo>
        <Campo label="Telefone" erro={erros.telefone?.[0]}>
          <input value={form.telefone} onChange={(e) => set('telefone', mascaraTelefone(e.target.value))} inputMode="numeric" placeholder="(11) 4002-8922" className={inputCls} />
        </Campo>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Contato (vendedor)" erro={erros.contato?.[0]}>
          <input value={form.contato} onChange={(e) => set('contato', e.target.value)} placeholder="Ex: Sr. Almeida" className={inputCls} />
        </Campo>
        <Campo label="Prazo de entrega (dias)" erro={erros.prazoEntrega?.[0]}>
          <input type="number" value={form.prazoEntrega} onChange={(e) => set('prazoEntrega', e.target.value)} className={inputCls} />
        </Campo>
      </div>
      <Campo label="Observações" erro={erros.observacoes?.[0]}>
        <input value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} placeholder="Ex: entrega às terças" className={inputCls} />
      </Campo>
    </Modal>
  );
}
