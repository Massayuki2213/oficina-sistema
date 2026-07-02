import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { brl, LABEL_STATUS_OS } from '../lib/format';

interface OS {
  id: string;
  numero: number;
  status: string;
  total: number;
  cliente?: { nome: string };
  carro?: { placa: string; modelo: string };
}
interface Peca {
  id: string;
  nome: string;
  estoqueAtual: number;
  unidade: string;
  estoqueBaixo: boolean;
}

const CORES_STATUS: Record<string, string> = {
  ABERTA: 'bg-azul-bg text-azul',
  EM_EXECUCAO: 'bg-azul-bg text-azul',
  AGUARDANDO_PECA: 'bg-amarelo-bg text-amarelo',
  CONCLUIDA: 'bg-verde-bg text-verde',
  ENTREGUE: 'bg-linha text-grafite/60',
};

function Card({ icon, label, valor, sub, cor }: { icon: string; label: string; valor: string; sub?: string; cor: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-linha shadow-sm relative">
      <div className={`absolute top-4 right-4 w-11 h-11 rounded-xl grid place-items-center text-xl ${cor}`}>{icon}</div>
      <div className="text-[13px] text-grafite/50 font-semibold">{label}</div>
      <div className="text-3xl font-extrabold mt-2 leading-none">{valor}</div>
      {sub && <div className="text-xs mt-2 font-semibold text-grafite/50">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { podeVerFinanceiro } = useAuth();
  const [ordens, setOrdens] = useState<OS[]>([]);
  const [pecas, setPecas] = useState<Peca[]>([]);
  const [caixa, setCaixa] = useState<{ entradas: number; saidas: number; saldo: number } | null>(null);

  useEffect(() => {
    api<OS[]>('/ordens').then(setOrdens).catch(() => {});
    api<Peca[]>('/pecas').then(setPecas).catch(() => {});
    if (podeVerFinanceiro) api('/caixa/resumo').then(setCaixa).catch(() => {});
  }, [podeVerFinanceiro]);

  const abertas = ordens.filter((o) => !['ENTREGUE', 'CANCELADA'].includes(o.status));
  const baixos = pecas.filter((p) => p.estoqueBaixo);
  const emAndamento = ordens.filter((o) => ['ABERTA', 'EM_EXECUCAO', 'AGUARDANDO_PECA', 'CONCLUIDA'].includes(o.status));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-petroleo">Painel do dia</h1>
        <p className="text-grafite/50 text-sm mt-0.5">Resumo rápido da oficina</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card icon="🛠️" label="OS em aberto" valor={String(abertas.length)} cor="bg-azul-bg text-azul" />
        <Card
          icon="💰"
          label="Caixa de hoje"
          valor={caixa ? brl(caixa.saldo) : podeVerFinanceiro ? '—' : '🔒'}
          sub={caixa ? `${brl(caixa.entradas)} entrou · ${brl(caixa.saidas)} saiu` : podeVerFinanceiro ? undefined : 'restrito ao Dono'}
          cor="bg-verde-bg text-verde"
        />
        <Card icon="📦" label="Peças em falta" valor={String(baixos.length)} cor="bg-vermelho-bg text-vermelho" />
        <Card icon="📄" label="Total de OS" valor={String(ordens.length)} cor="bg-amarelo-bg text-amarelo" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-linha shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-linha font-bold text-petroleo">🛠️ OS em andamento</div>
          <div className="p-2">
            {emAndamento.length === 0 && <div className="text-center text-grafite/40 py-8 text-sm">Nenhuma OS em andamento</div>}
            {emAndamento.slice(0, 6).map((o) => (
              <div key={o.id} className="flex items-center gap-3 px-3 py-3 border-b border-fundo last:border-0">
                <div className="w-9 h-9 rounded-lg bg-fundo grid place-items-center">🚗</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">
                    #{o.numero} · {o.carro?.modelo ?? '—'}
                  </div>
                  <div className="text-xs text-grafite/50">{o.cliente?.nome}</div>
                </div>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${CORES_STATUS[o.status] ?? 'bg-linha'}`}>
                  {LABEL_STATUS_OS[o.status] ?? o.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-linha shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-linha font-bold text-petroleo">⚠️ Estoque baixo</div>
          <div className="p-2">
            {baixos.length === 0 && <div className="text-center text-grafite/40 py-8 text-sm">Estoque tranquilo 👍</div>}
            {baixos.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-3 border-b border-fundo last:border-0">
                <div className="w-9 h-9 rounded-lg bg-vermelho-bg grid place-items-center">📦</div>
                <div className="flex-1 font-semibold text-sm">{p.nome}</div>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-vermelho-bg text-vermelho">
                  {p.estoqueAtual} {p.unidade}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
