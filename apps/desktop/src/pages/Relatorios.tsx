import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { brl, LABEL_ORIGEM } from '../lib/format';
import { queryPeriodo, type PeriodoKey } from '../lib/periodo';
import { PageHeader, Painel, Kpi, Periodo, Restrito } from '../components/ui';

interface Resumo {
  faturamento: number;
  despesas: number;
  lucroCaixa: number;
  custoPecasVendidas: number;
  lucroBrutoPecas: number;
  numOrdens: number;
  ticketMedio: number;
}
interface ItemRank {
  nome: string;
  quantidade: number;
  receita: number;
}
interface Rankings {
  servicosMaisVendidos: ItemRank[];
  pecasMaisUsadas: ItemRank[];
  clientesTop: { nome: string; ordens: number; total: number }[];
}
interface PorCategoria {
  despesasPorCategoria: Record<string, number>;
  entradasPorOrigem: Record<string, number>;
}

function Barra({ label, sub, valor, max, cor }: { label: string; sub: string; valor: number; max: number; cor: string }) {
  const pct = max > 0 ? Math.max(3, (valor / max) * 100) : 0;
  return (
    <div className="px-5 py-2.5">
      <div className="flex items-center gap-2 text-sm mb-1.5">
        <span className="font-bold truncate">{label}</span>
        <span className="ml-auto text-grafite/50 text-xs whitespace-nowrap tabular-nums">{sub}</span>
      </div>
      <div className="h-2 rounded-full bg-fundo overflow-hidden">
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PainelLista({ titulo, icon, children, vazio }: { titulo: string; icon: string; children: React.ReactNode; vazio: boolean }) {
  return (
    <Painel>
      <div className="px-5 py-4 border-b border-linha font-bold text-petroleo">{icon} {titulo}</div>
      <div className="py-2">
        {vazio ? <div className="text-center text-grafite/40 py-8 text-sm">Sem dados no período</div> : children}
      </div>
    </Painel>
  );
}

export default function Relatorios() {
  const { podeVerFinanceiro } = useAuth();
  const [periodo, setPeriodo] = useState<PeriodoKey>('mes');
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [rank, setRank] = useState<Rankings | null>(null);
  const [cat, setCat] = useState<PorCategoria | null>(null);

  useEffect(() => {
    if (!podeVerFinanceiro) return;
    const q = queryPeriodo(periodo);
    api<Resumo>(`/relatorios/resumo${q}`).then(setResumo).catch(() => {});
    api<Rankings>(`/relatorios/rankings${q}`).then(setRank).catch(() => {});
    api<PorCategoria>(`/relatorios/por-categoria${q}`).then(setCat).catch(() => {});
  }, [periodo, podeVerFinanceiro]);

  if (!podeVerFinanceiro) return <Restrito>Os relatórios são exclusivos do Dono.</Restrito>;

  const maxServ = Math.max(1, ...(rank?.servicosMaisVendidos.map((s) => s.quantidade) ?? []));
  const maxPec = Math.max(1, ...(rank?.pecasMaisUsadas.map((p) => p.quantidade) ?? []));
  const maxCli = Math.max(1, ...(rank?.clientesTop.map((c) => c.total) ?? []));

  const despCats = Object.entries(cat?.despesasPorCategoria ?? {}).sort((a, b) => b[1] - a[1]);
  const maxDesp = Math.max(1, ...despCats.map(([, v]) => v));
  const entradas = Object.entries(cat?.entradasPorOrigem ?? {}).sort((a, b) => b[1] - a[1]);
  const maxEnt = Math.max(1, ...entradas.map(([, v]) => v));

  const lucroNeg = (resumo?.lucroCaixa ?? 0) < 0;

  return (
    <div>
      <PageHeader title="Relatórios" subtitle="Faturamento, lucro e o que mais gira na oficina">
        <Periodo value={periodo} onChange={setPeriodo} />
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi label="Faturamento" valor={brl(resumo?.faturamento ?? 0)} icon="💵" cor="bg-verde-bg text-verde" sub="o que entrou no caixa" />
        <Kpi label="Despesas" valor={brl(resumo?.despesas ?? 0)} icon="📉" cor="bg-vermelho-bg text-vermelho" sub="o que saiu" />
        <Kpi
          label="Lucro real"
          valor={brl(resumo?.lucroCaixa ?? 0)}
          icon={lucroNeg ? '▼' : '▲'}
          cor={lucroNeg ? 'bg-vermelho-bg text-vermelho' : 'bg-verde-bg text-verde'}
          sub="faturamento − despesas"
        />
        <Kpi
          label="Ticket médio"
          valor={brl(resumo?.ticketMedio ?? 0)}
          icon="🎫"
          cor="bg-azul-bg text-azul"
          sub={`${resumo?.numOrdens ?? 0} OS no período`}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <PainelLista titulo="Serviços mais vendidos" icon="🔧" vazio={!rank?.servicosMaisVendidos.length}>
          {rank?.servicosMaisVendidos.map((s) => (
            <Barra key={s.nome} label={s.nome} sub={`${s.quantidade}× · ${brl(s.receita)}`} valor={s.quantidade} max={maxServ} cor="bg-laranja" />
          ))}
        </PainelLista>
        <PainelLista titulo="Peças mais usadas" icon="📦" vazio={!rank?.pecasMaisUsadas.length}>
          {rank?.pecasMaisUsadas.map((p) => (
            <Barra key={p.nome} label={p.nome} sub={`${p.quantidade}× · ${brl(p.receita)}`} valor={p.quantidade} max={maxPec} cor="bg-petroleo" />
          ))}
        </PainelLista>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <PainelLista titulo="Clientes que mais gastam" icon="🏆" vazio={!rank?.clientesTop.length}>
          {rank?.clientesTop.map((c) => (
            <Barra key={c.nome} label={c.nome} sub={`${c.ordens} OS · ${brl(c.total)}`} valor={c.total} max={maxCli} cor="bg-verde" />
          ))}
        </PainelLista>
        <PainelLista titulo="Entradas por origem" icon="💰" vazio={entradas.length === 0}>
          {entradas.map(([origem, v]) => (
            <Barra key={origem} label={LABEL_ORIGEM[origem] ?? origem} sub={brl(v)} valor={v} max={maxEnt} cor="bg-verde" />
          ))}
        </PainelLista>
      </div>

      <PainelLista titulo="Despesas por categoria" icon="📊" vazio={despCats.length === 0}>
        {despCats.map(([categoria, v]) => (
          <Barra key={categoria} label={categoria} sub={brl(v)} valor={v} max={maxDesp} cor="bg-vermelho" />
        ))}
      </PainelLista>
    </div>
  );
}
