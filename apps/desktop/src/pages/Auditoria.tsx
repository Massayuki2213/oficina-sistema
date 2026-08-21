import { useEffect, useState } from 'react';
import { History, User } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, type Perfil } from '../lib/auth';
import { LABEL_PERFIL } from '../lib/format';
import { PageHeader, Painel, Badge, inputCls, thCls, tdCls, VazioOuCarregando, Restrito } from '../components/ui';

interface Log {
  id: string;
  data: string;
  acao: string;
  entidade: string;
  entidadeId: string | null;
  detalhes: string | null;
  usuario: { id: string; nome: string; perfil: Perfil } | null;
  descricao: string;
}
interface EntidadeFiltro {
  entidade: string;
  rotulo: string;
  total: number;
}

// Cor por natureza da ação: o que destrói ou mexe em dinheiro salta aos olhos.
const COR_ACAO: Record<string, string> = {
  EXCLUIR: 'bg-vermelho-bg text-vermelho',
  LOGIN_FALHOU: 'bg-vermelho-bg text-vermelho',
  CRIAR: 'bg-verde-bg text-verde',
  RECEBER: 'bg-verde-bg text-verde',
  PAGAR: 'bg-amarelo-bg text-amarelo',
  APROVAR: 'bg-amarelo-bg text-amarelo',
};

const dataHoraBR = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

/** O corpo da requisição é JSON cru; mostra só o que ajuda a entender o que mudou. */
function resumir(detalhes: string | null): string {
  if (!detalhes) return '—';
  try {
    const obj = JSON.parse(detalhes) as Record<string, unknown>;
    const partes = Object.entries(obj)
      .filter(([, v]) => v !== null && v !== '' && typeof v !== 'object')
      .slice(0, 4)
      .map(([k, v]) => `${k}: ${v}`);
    return partes.length ? partes.join(' · ') : '—';
  } catch {
    return detalhes.slice(0, 80);
  }
}

export default function Auditoria() {
  const { usuario } = useAuth();
  const [logs, setLogs] = useState<Log[]>([]);
  const [entidades, setEntidades] = useState<EntidadeFiltro[]>([]);
  const [entidade, setEntidade] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [carregando, setCarregando] = useState(true);

  const ehDono = usuario?.perfil === 'DONO';

  async function carregar() {
    setCarregando(true);
    try {
      const q = new URLSearchParams();
      if (entidade) q.set('entidade', entidade);
      if (de) q.set('de', de);
      if (ate) q.set('ate', ate);
      setLogs(await api<Log[]>(`/auditoria?${q}`));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    if (!ehDono) return;
    void api<EntidadeFiltro[]>('/auditoria/entidades').then(setEntidades);
  }, [ehDono]);

  useEffect(() => {
    if (!ehDono) return;
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ehDono, entidade, de, ate]);

  if (!ehDono) return <Restrito />;

  return (
    <div>
      <PageHeader title="Histórico de atividade" subtitle="Quem fez o quê e quando, em todo o sistema" />

      <Painel>
        <div className="flex flex-wrap gap-3 p-4 border-b border-linha">
          <select className={inputCls} value={entidade} onChange={(e) => setEntidade(e.target.value)}>
            <option value="">Todos os assuntos</option>
            {entidades.map((e) => (
              <option key={e.entidade} value={e.entidade}>
                {e.rotulo} ({e.total})
              </option>
            ))}
          </select>
          <input type="date" className={inputCls} value={de} onChange={(e) => setDe(e.target.value)} title="De" />
          <input type="date" className={inputCls} value={ate} onChange={(e) => setAte(e.target.value)} title="Até" />
        </div>

        <table className="w-full">
          <thead className="bg-fundo border-b border-linha">
            <tr>
              <th className={thCls}>Quando</th>
              <th className={thCls}>Quem</th>
              <th className={thCls}>O que fez</th>
              <th className={thCls}>Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-linha">
            <VazioOuCarregando carregando={carregando} vazio={logs.length === 0} colSpan={4} />
            {logs.map((l) => (
              <tr key={l.id} className="hover:bg-fundo/60">
                <td className={`${tdCls} whitespace-nowrap text-grafite/60`}>{dataHoraBR(l.data)}</td>
                <td className={tdCls}>
                  {l.usuario ? (
                    <div className="flex items-center gap-2">
                      <User size={14} className="text-grafite/40 shrink-0" />
                      <span className="font-semibold">{l.usuario.nome}</span>
                      <span className="text-[11px] text-grafite/40">{LABEL_PERFIL[l.usuario.perfil]}</span>
                    </div>
                  ) : (
                    <span className="text-grafite/40">—</span>
                  )}
                </td>
                <td className={tdCls}>
                  <Badge cor={COR_ACAO[l.acao] ?? 'bg-linha text-grafite/60'}>{l.descricao}</Badge>
                </td>
                <td className={`${tdCls} text-grafite/50 max-w-md truncate`} title={l.detalhes ?? ''}>
                  {resumir(l.detalhes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {logs.length >= 200 && (
          <p className="px-4 py-3 text-xs text-grafite/50 border-t border-linha flex items-center gap-2">
            <History size={13} /> Mostrando os 200 registros mais recentes. Use os filtros de data para ver mais atrás.
          </p>
        )}
      </Painel>
    </div>
  );
}
