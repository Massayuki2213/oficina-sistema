import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAvisos } from '../lib/avisos';
import { mascaraPlaca } from '../lib/mascaras';
import { PageHeader, SearchBar, BtnPrimary, BtnGhost, Painel, Modal, Campo, AcaoEditar, AcaoExcluir, inputCls, thCls, tdCls, VazioOuCarregando } from '../components/ui';

interface Carro {
  id: string;
  clienteId: string;
  placa: string;
  marca: string;
  modelo: string;
  ano: number | null;
  cor: string | null;
  kmAtual: number | null;
  combustivel: string | null;
  cliente?: { nome: string };
}
interface ClienteOpt {
  id: string;
  nome: string;
}

export default function Carros() {
  const { usuario } = useAuth();
  const avisos = useAvisos();
  const ehDono = usuario?.perfil === 'DONO';
  const [carros, setCarros] = useState<Carro[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState<Carro | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function carregar(termo = '') {
    setCarregando(true);
    try {
      setCarros(await api<Carro[]>(termo ? `/carros?busca=${encodeURIComponent(termo)}` : '/carros'));
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    carregar();
  }, []);

  async function excluir(c: Carro) {
    const ok = await avisos.confirmar({
      titulo: 'Excluir veículo',
      mensagem: `${c.placa} (${c.marca} ${c.modelo}) sai da lista. As OS antigas são preservadas.`,
      botao: 'Excluir',
      perigo: true,
    });
    if (!ok) return;

    setOcupado(c.id);
    try {
      await api(`/carros/${c.id}`, { method: 'DELETE' });
      avisos.sucesso(`Veículo ${c.placa} excluído.`);
      await carregar(busca);
    } catch (err) {
      avisos.erro(err instanceof ApiError ? err.message : 'Erro ao excluir');
    } finally {
      setOcupado(null);
    }
  }

  const fecharForm = () => { setNovo(false); setEditar(null); };
  const aposSalvar = (placa: string) => {
    avisos.sucesso(editar ? `Veículo ${placa} atualizado.` : `Veículo ${placa} cadastrado.`);
    fecharForm();
    carregar(busca);
  };

  return (
    <div>
      <PageHeader title="Carros" subtitle={`${carros.length} veículo(s)`}>
        <SearchBar value={busca} onChange={setBusca} onSubmit={() => carregar(busca)} placeholder="Placa, modelo ou dono..." />
        <BtnPrimary onClick={() => setNovo(true)}>+ Novo veículo</BtnPrimary>
      </PageHeader>

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Placa</th>
              <th className={thCls}>Veículo</th>
              <th className={thCls}>Ano</th>
              <th className={thCls}>Cor</th>
              <th className={thCls}>KM</th>
              <th className={thCls}>Dono</th>
              <th className={`${thCls} text-right`}>Ações</th>
            </tr>
          </thead>
          <tbody>
            <VazioOuCarregando carregando={carregando} vazio={carros.length === 0} colSpan={7} />
            {carros.map((c) => (
              <tr key={c.id} className="border-b border-fundo last:border-0 hover:bg-fundo/40 transition">
                <td className={tdCls}>
                  <span className="font-mono font-bold tracking-wider bg-grafite text-white px-2 py-0.5 rounded text-xs border-2 border-[#3a4a56]">
                    {c.placa}
                  </span>
                </td>
                <td className={`${tdCls} font-bold`}>
                  {c.marca} {c.modelo}
                </td>
                <td className={tdCls}>{c.ano ?? '—'}</td>
                <td className={tdCls}>{c.cor ?? '—'}</td>
                <td className={tdCls}>{c.kmAtual != null ? `${c.kmAtual.toLocaleString('pt-BR')} km` : '—'}</td>
                <td className={tdCls}>{c.cliente?.nome ?? '—'}</td>
                <td className={`${tdCls} text-right whitespace-nowrap`}>
                  <AcaoEditar onClick={() => setEditar(c)} />
                  {ehDono && <AcaoExcluir onClick={() => excluir(c)} disabled={ocupado === c.id} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Painel>

      {(novo || editar) && <FormCarro carro={editar} onFechar={fecharForm} onSalvo={aposSalvar} />}
    </div>
  );
}

function FormCarro({ carro, onFechar, onSalvo }: { carro: Carro | null; onFechar: () => void; onSalvo: (placa: string) => void }) {
  const editando = !!carro;
  const [clientes, setClientes] = useState<ClienteOpt[]>([]);
  const [form, setForm] = useState({
    clienteId: carro?.clienteId ?? '',
    placa: mascaraPlaca(carro?.placa ?? ''),
    marca: carro?.marca ?? '',
    modelo: carro?.modelo ?? '',
    ano: carro?.ano != null ? String(carro.ano) : '',
    cor: carro?.cor ?? '',
    kmAtual: carro?.kmAtual != null ? String(carro.kmAtual) : '',
    combustivel: carro?.combustivel ?? '',
  });
  const [erros, setErros] = useState<Record<string, string[]>>({});
  const [salvando, setSalvando] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api<ClienteOpt[]>('/clientes').then(setClientes).catch(() => {});
  }, []);

  async function salvar() {
    setSalvando(true);
    setErros({});
    try {
      if (editando) await api(`/carros/${carro!.id}`, { method: 'PUT', body: form });
      else await api('/carros', { method: 'POST', body: form });
      onSalvo(form.placa);
    } catch (err) {
      if (err instanceof ApiError) setErros(err.erros ?? { placa: [err.message] });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title={editando ? 'Editar veículo' : 'Novo veículo'}
      onClose={onFechar}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Salvar veículo'}
          </BtnPrimary>
        </>
      }
    >
      <Campo label="Cliente (dono)" erro={erros.clienteId?.[0]}>
        <select value={form.clienteId} onChange={(e) => set('clienteId', e.target.value)} className={inputCls}>
          <option value="">Selecione...</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </Campo>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Placa" erro={erros.placa?.[0]}>
          <input
            value={form.placa}
            onChange={(e) => set('placa', mascaraPlaca(e.target.value))}
            placeholder="ABC-1234"
            className={`${inputCls} font-mono uppercase tracking-wider`}
          />
        </Campo>
        <Campo label="Ano" erro={erros.ano?.[0]}>
          <input type="number" value={form.ano} onChange={(e) => set('ano', e.target.value)} className={inputCls} />
        </Campo>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Marca" erro={erros.marca?.[0]}>
          <input value={form.marca} onChange={(e) => set('marca', e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Modelo" erro={erros.modelo?.[0]}>
          <input value={form.modelo} onChange={(e) => set('modelo', e.target.value)} className={inputCls} />
        </Campo>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Campo label="Cor">
          <input value={form.cor} onChange={(e) => set('cor', e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="KM atual">
          <input type="number" value={form.kmAtual} onChange={(e) => set('kmAtual', e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Combustível">
          <input value={form.combustivel} onChange={(e) => set('combustivel', e.target.value)} placeholder="Flex" className={inputCls} />
        </Campo>
      </div>
    </Modal>
  );
}
