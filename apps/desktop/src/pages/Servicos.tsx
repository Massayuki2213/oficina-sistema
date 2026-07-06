import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { brl } from '../lib/format';
import { PageHeader, SearchBar, BtnPrimary, BtnGhost, Painel, Badge, Modal, Campo, AcaoEditar, AcaoExcluir, inputCls, thCls, tdCls, VazioOuCarregando } from '../components/ui';

interface Servico {
  id: string;
  nome: string;
  categoria: string | null;
  precoMaoDeObra: number;
  tempoEstimadoMin: number | null;
}

export default function Servicos() {
  const { usuario } = useAuth();
  const ehDono = usuario?.perfil === 'DONO';
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState<Servico | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function carregar(termo = '') {
    setCarregando(true);
    try {
      setServicos(await api<Servico[]>(termo ? `/servicos?busca=${encodeURIComponent(termo)}` : '/servicos'));
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    carregar();
  }, []);

  async function excluir(s: Servico) {
    if (!confirm(`Excluir o serviço "${s.nome}"? Ele sai do catálogo (OS antigas são preservadas).`)) return;
    setOcupado(s.id);
    try {
      await api(`/servicos/${s.id}`, { method: 'DELETE' });
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
      <PageHeader title="Serviços" subtitle={`${servicos.length} no catálogo de mão de obra`}>
        <SearchBar value={busca} onChange={setBusca} onSubmit={() => carregar(busca)} placeholder="Nome ou categoria..." />
        <BtnPrimary onClick={() => setNovo(true)}>+ Novo serviço</BtnPrimary>
      </PageHeader>

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Serviço</th>
              <th className={thCls}>Categoria</th>
              <th className={thCls}>Mão de obra</th>
              <th className={thCls}>Tempo estimado</th>
              <th className={`${thCls} text-right`}>Ações</th>
            </tr>
          </thead>
          <tbody>
            <VazioOuCarregando carregando={carregando} vazio={servicos.length === 0} colSpan={5} />
            {servicos.map((s) => (
              <tr key={s.id} className="border-b border-fundo last:border-0 hover:bg-fundo/40 transition">
                <td className={`${tdCls} font-bold`}>{s.nome}</td>
                <td className={tdCls}>{s.categoria ? <Badge cor="bg-azul-bg text-azul">{s.categoria}</Badge> : '—'}</td>
                <td className={`${tdCls} font-bold`}>{brl(s.precoMaoDeObra)}</td>
                <td className={tdCls}>{s.tempoEstimadoMin ? `${s.tempoEstimadoMin} min` : '—'}</td>
                <td className={`${tdCls} text-right whitespace-nowrap`}>
                  <AcaoEditar onClick={() => setEditar(s)} />
                  {ehDono && <AcaoExcluir onClick={() => excluir(s)} disabled={ocupado === s.id} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Painel>

      {(novo || editar) && <FormServico servico={editar} onFechar={fecharForm} onSalvo={aposSalvar} />}
    </div>
  );
}

function FormServico({ servico, onFechar, onSalvo }: { servico: Servico | null; onFechar: () => void; onSalvo: () => void }) {
  const editando = !!servico;
  const [form, setForm] = useState({
    nome: servico?.nome ?? '',
    categoria: servico?.categoria ?? '',
    precoMaoDeObra: servico ? String(servico.precoMaoDeObra) : '',
    tempoEstimadoMin: servico?.tempoEstimadoMin != null ? String(servico.tempoEstimadoMin) : '',
  });
  const [erros, setErros] = useState<Record<string, string[]>>({});
  const [salvando, setSalvando] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function salvar() {
    setSalvando(true);
    setErros({});
    try {
      if (editando) await api(`/servicos/${servico!.id}`, { method: 'PUT', body: form });
      else await api('/servicos', { method: 'POST', body: form });
      onSalvo();
    } catch (err) {
      if (err instanceof ApiError) setErros(err.erros ?? { nome: [err.message] });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title={editando ? 'Editar serviço' : 'Novo serviço'}
      onClose={onFechar}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Salvar serviço'}
          </BtnPrimary>
        </>
      }
    >
      <Campo label="Nome do serviço" erro={erros.nome?.[0]}>
        <input value={form.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex: Troca de óleo + filtro" className={inputCls} />
      </Campo>
      <Campo label="Categoria" erro={erros.categoria?.[0]}>
        <input value={form.categoria} onChange={(e) => set('categoria', e.target.value)} placeholder="Motor, Freios, Elétrica..." className={inputCls} />
      </Campo>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Mão de obra (R$)" erro={erros.precoMaoDeObra?.[0]}>
          <input type="number" step="0.01" value={form.precoMaoDeObra} onChange={(e) => set('precoMaoDeObra', e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Tempo (min)">
          <input type="number" value={form.tempoEstimadoMin} onChange={(e) => set('tempoEstimadoMin', e.target.value)} className={inputCls} />
        </Campo>
      </div>
    </Modal>
  );
}
