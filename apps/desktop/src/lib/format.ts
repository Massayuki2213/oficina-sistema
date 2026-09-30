import type {
  OrigemLancamento,
  StatusCompra,
  StatusOrcamento,
  StatusOS,
  StatusParcela,
  StatusVisita,
} from '@hermes/shared';

export { brl, formatarQtd } from '@hermes/shared';
export {
  LABEL_FORMA_PAGAMENTO,
  LABEL_ORIGEM_LANCAMENTO,
  LABEL_PERFIL,
  LABEL_STATUS_COMPRA,
  LABEL_STATUS_ORCAMENTO,
  LABEL_STATUS_OS,
  LABEL_STATUS_PARCELA,
  LABEL_STATUS_VISITA,
  LABEL_TIPO_MOVIMENTO,
  LABEL_TIPO_PESSOA,
  LABEL_TIPO_VISITA,
} from '@hermes/shared';
export { mascaraCpfCnpj as formatarDocumento, mascaraTelefone as formatarTelefone, mascaraPlaca as formatarPlaca } from './mascaras';

export const iniciais = (nome: string) =>
  nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

// ---- Datas (sempre no horário do navegador, que é o da oficina) ----

/**
 * "2026-09-29" é um dia do calendário, sem fuso: vira meia-noite LOCAL.
 * (`new Date("2026-09-29")` seria meia-noite em UTC — 21h do dia anterior
 * no Brasil, e a data apareceria um dia antes.) O resto é ISO com hora.
 */
export function paraData(v: string | Date): Date {
  if (v instanceof Date) return v;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v);
}

export const dataBR = (iso: string | Date) =>
  paraData(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

export const horaBR = (iso: string | Date) =>
  paraData(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export const dataHoraBR = (iso: string | Date) => `${dataBR(iso)} ${horaBR(iso)}`;

export const diaLongoBR = (iso: string | Date) => {
  const s = paraData(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** "2026-09" → "set/26" */
export const mesCurtoBR = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
};

/** Date → "2026-09-29" (data local, sem o pulo de dia do toISOString em UTC). */
export function paraDataISO(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const hojeISO = () => paraDataISO(new Date());

export function daquiDias(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return paraDataISO(d);
}

/**
 * "2026-01-31" + 1 mês → "2026-02-28": o dia que não existe no mês cai no
 * último dia dele. É a mesma regra do servidor para o vencimento das parcelas.
 */
export function somarMeses(iso: string, meses: number) {
  const d = paraData(iso);
  const alvo = new Date(d.getFullYear(), d.getMonth() + meses, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(d.getDate(), ultimoDia));
  return paraDataISO(alvo);
}

/** ISO com hora → valor do <input type="datetime-local"> ("2026-09-29T14:30"), no horário local. */
export function paraDataHoraLocal(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${paraDataISO(d)}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Valor do <input type="datetime-local"> → ISO com fuso (o que a API espera); vazio → null. */
export const deDataHoraLocal = (v: string) => (v ? new Date(v).toISOString() : null);

/** "há 3 dias", "hoje", "em 2 dias" */
export function relativo(iso: string) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(paraData(iso));
  alvo.setHours(0, 0, 0, 0);
  const dias = Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  if (dias === -1) return 'ontem';
  return dias > 0 ? `em ${dias} dias` : `há ${-dias} dias`;
}

// ---- Cores (classes Tailwind) por status, reutilizadas nos badges ----

export const CORES_STATUS_OS: Record<StatusOS, string> = {
  ABERTA: 'bg-azul-bg text-azul',
  EM_EXECUCAO: 'bg-azul-bg text-azul',
  AGUARDANDO_PECA: 'bg-amarelo-bg text-amarelo',
  AGUARDANDO_APROVACAO: 'bg-amarelo-bg text-amarelo',
  CONCLUIDA: 'bg-verde-bg text-verde',
  ENTREGUE: 'bg-linha text-grafite/60',
  CANCELADA: 'bg-vermelho-bg text-vermelho',
};

export const CORES_STATUS_ORCAMENTO: Record<StatusOrcamento, string> = {
  RASCUNHO: 'bg-linha text-grafite/60',
  ENVIADO: 'bg-azul-bg text-azul',
  APROVADO: 'bg-verde-bg text-verde',
  RECUSADO: 'bg-vermelho-bg text-vermelho',
  EXPIRADO: 'bg-amarelo-bg text-amarelo',
};

export const CORES_STATUS_VISITA: Record<StatusVisita, string> = {
  AGENDADA: 'bg-azul-bg text-azul',
  CONFIRMADA: 'bg-verde-bg text-verde',
  REALIZADA: 'bg-linha text-grafite/60',
  FALTOU: 'bg-vermelho-bg text-vermelho',
};

export const CORES_STATUS_PARCELA: Record<StatusParcela, string> = {
  PENDENTE: 'bg-amarelo-bg text-amarelo',
  PAGA: 'bg-verde-bg text-verde',
  CANCELADA: 'bg-linha text-grafite/60',
};

export const CORES_STATUS_COMPRA: Record<StatusCompra, string> = {
  PENDENTE: 'bg-amarelo-bg text-amarelo',
  PAGA: 'bg-verde-bg text-verde',
};

export const CORES_ORIGEM: Record<OrigemLancamento, string> = {
  OS: 'bg-azul-bg text-azul',
  VENDA_BALCAO: 'bg-azul-bg text-azul',
  DESPESA: 'bg-linha text-grafite/60',
  APORTE: 'bg-verde-bg text-verde',
  RETIRADA: 'bg-amarelo-bg text-amarelo',
  ESTORNO: 'bg-vermelho-bg text-vermelho',
};
