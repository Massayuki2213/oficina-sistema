import { useEffect, useState, type ReactNode } from 'react';
import { ClipboardList, Wallet, Package, FileText, AlertTriangle, Car, Lock, CheckCircle2, PhoneCall, HandCoins, type LucideIcon } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { brl, LABEL_STATUS_OS } from '../lib/format';
import { Link } from 'react-router-dom';

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

interface RevisaoVencida {
  carroId: string;
  placa: string;
  modelo: string;
  cliente: { id: string; nome: string; telefone: string | null };
  diasSemServico: number;
}
interface FiadoAtraso {
  cliente: { id: string; nome: string; telefone: string | null };
  valor: number;
  parcelas: number;
  diasAtraso: number;
}
interface Alertas {
  revisaoVencida: RevisaoVencida[];
  fiadoEmAtraso: FiadoAtraso[];
  total: number;
}

const CORES_STATUS: Record<string, string> = {
  ABERTA: 'bg-azul-bg text-azul',
  EM_EXECUCAO: 'bg-azul-bg text-azul',
  AGUARDANDO_PECA: 'bg-amarelo-bg text-amarelo',
  CONCLUIDA: 'bg-verde-bg text-verde',
  ENTREGUE: 'bg-linha text-grafite/60',
};

function Card({ icon: Icon, label, valor, sub, cor }: { icon: LucideIcon; label: string; valor: ReactNode; sub?: string; cor: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-linha shadow-sm relative">
      <div className={`absolute top-4 right-4 w-11 h-11 rounded-xl grid place-items-center ${cor}`}>
        <Icon size={22} strokeWidth={2.2} />
      </div>
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
  const [alertas, setAlertas] = useState<Alertas | null>(null);

  useEffect(() => {
    api<OS[]>('/ordens').then(setOrdens).catch(() => {});
    api<Peca[]>('/pecas').then(setPecas).catch(() => {});
    api<Alertas>('/alertas').then(setAlertas).catch(() => {});
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card icon={ClipboardList} label="OS em aberto" valor={String(abertas.length)} cor="bg-azul-bg text-azul" />
        <Card
          icon={Wallet}
          label="Caixa de hoje"
          valor={caixa ? brl(caixa.saldo) : podeVerFinanceiro ? '—' : <Lock size={24} className="text-grafite/30" />}
          sub={caixa ? `${brl(caixa.entradas)} entrou · ${brl(caixa.saidas)} saiu` : podeVerFinanceiro ? undefined : 'restrito ao Dono'}
          cor="bg-verde-bg text-verde"
        />
        <Card icon={Package} label="Peças em falta" valor={String(baixos.length)} cor="bg-vermelho-bg text-vermelho" />
        <Card icon={FileText} label="Total de OS" valor={String(ordens.length)} cor="bg-amarelo-bg text-amarelo" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-linha shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-linha font-bold text-petroleo flex items-center gap-2">
            <ClipboardList size={18} className="text-petroleo/70" /> OS em andamento
          </div>
          <div className="p-2">
            {emAndamento.length === 0 && <div className="text-center text-grafite/40 py-8 text-sm">Nenhuma OS em andamento</div>}
            {emAndamento.slice(0, 6).map((o) => (
              <div key={o.id} className="flex items-center gap-3 px-3 py-3 border-b border-fundo last:border-0">
                <div className="w-9 h-9 rounded-lg bg-fundo grid place-items-center text-grafite/50">
                  <Car size={18} />
                </div>
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
          <div className="px-5 py-4 border-b border-linha font-bold text-petroleo flex items-center gap-2">
            <AlertTriangle size={18} className="text-amarelo" /> Estoque baixo
          </div>
          <div className="p-2">
            {baixos.length === 0 && (
              <div className="flex items-center justify-center gap-2 text-grafite/40 py-8 text-sm">
                <CheckCircle2 size={16} className="text-verde" /> Estoque tranquilo
              </div>
            )}
            {baixos.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-3 border-b border-fundo last:border-0">
                <div className="w-9 h-9 rounded-lg bg-vermelho-bg text-vermelho grid place-items-center">
                  <Package size={18} />
                </div>
                <div className="flex-1 font-semibold text-sm">{p.nome}</div>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-vermelho-bg text-vermelho">
                  {p.estoqueAtual} {p.unidade}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RN-20 e RN-11.2: o que estava calculado no banco e ninguém via. */}
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Bloco
          icone={PhoneCall}
          corIcone="text-azul"
          titulo="Oportunidades de retorno"
          descricao="Sem passar na oficina há mais de 6 meses"
          vazio="Nenhum cliente atrasado na revisão"
          itens={alertas?.revisaoVencida ?? []}
          verMais="/carros"
          render={(c: RevisaoVencida) => (
            <div key={c.carroId} className="flex items-center gap-3 px-3 py-3 border-b border-fundo last:border-0">
              <div className="w-9 h-9 rounded-lg bg-azul-bg text-azul grid place-items-center shrink-0">
                <Car size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{c.cliente.nome}</div>
                <div className="text-xs text-grafite/50">
                  <span className="font-mono bg-grafite text-white px-1.5 py-0.5 rounded">{c.placa}</span> {c.modelo}
                  {c.cliente.telefone && <span> · {c.cliente.telefone}</span>}
                </div>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-azul-bg text-azul whitespace-nowrap">
                {Math.floor(c.diasSemServico / 30)} meses
              </span>
            </div>
          )}
        />

        {podeVerFinanceiro && (
          <Bloco
            icone={HandCoins}
            corIcone="text-vermelho"
            titulo="Fiado em atraso"
            descricao="Parcelas vencidas e não recebidas"
            vazio="Ninguém devendo em atraso"
            itens={alertas?.fiadoEmAtraso ?? []}
            verMais="/contas-receber"
            render={(f: FiadoAtraso) => (
              <div key={f.cliente.id} className="flex items-center gap-3 px-3 py-3 border-b border-fundo last:border-0">
                <div className="w-9 h-9 rounded-lg bg-vermelho-bg text-vermelho grid place-items-center shrink-0">
                  <HandCoins size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{f.cliente.nome}</div>
                  <div className="text-xs text-grafite/50">
                    {f.parcelas} parcela(s) · {f.diasAtraso} dia(s) de atraso
                  </div>
                </div>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-vermelho-bg text-vermelho whitespace-nowrap">
                  {brl(f.valor)}
                </span>
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}

/** Painel de alerta: cabeçalho, lista curta e atalho para a tela cheia. */
function Bloco<T>({
  icone: Icone,
  corIcone,
  titulo,
  descricao,
  vazio,
  itens,
  verMais,
  render,
}: {
  icone: LucideIcon;
  corIcone: string;
  titulo: string;
  descricao: string;
  vazio: string;
  itens: T[];
  verMais: string;
  render: (item: T) => ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-linha shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-linha flex items-center gap-2">
        <Icone size={18} className={corIcone} />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-petroleo leading-tight">{titulo}</div>
          <div className="text-[11px] text-grafite/50">{descricao}</div>
        </div>
        {itens.length > 0 && (
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full bg-fundo ${corIcone}`}>{itens.length}</span>
        )}
      </div>
      <div className="p-2">
        {itens.length === 0 ? (
          <div className="flex items-center justify-center gap-2 text-grafite/40 py-8 text-sm">
            <CheckCircle2 size={16} className="text-verde" /> {vazio}
          </div>
        ) : (
          <>
            {itens.slice(0, 5).map(render)}
            {itens.length > 5 && (
              <Link to={verMais} className="block text-center text-xs font-bold text-azul py-2.5 hover:underline">
                ver todos os {itens.length}
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
