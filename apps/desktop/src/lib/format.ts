export const brl = (v: number | string) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const iniciais = (nome: string) =>
  nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

export const LABEL_PERFIL: Record<string, string> = {
  DONO: 'Dono',
  ATENDENTE: 'Atendente',
  MECANICO: 'Mecânico',
};

export const LABEL_STATUS_OS: Record<string, string> = {
  ABERTA: 'Aberta',
  EM_EXECUCAO: 'Em execução',
  AGUARDANDO_PECA: 'Aguardando peça',
  AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  CONCLUIDA: 'Concluída',
  ENTREGUE: 'Entregue',
  CANCELADA: 'Cancelada',
};

export const dataBR = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

export const LABEL_STATUS_ORCAMENTO: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  ENVIADO: 'Enviado',
  APROVADO: 'Aprovado',
  RECUSADO: 'Recusado',
  EXPIRADO: 'Expirado',
};

// Cores (classes Tailwind) por status, reutilizadas nos badges.
export const CORES_STATUS_OS: Record<string, string> = {
  ABERTA: 'bg-azul-bg text-azul',
  EM_EXECUCAO: 'bg-azul-bg text-azul',
  AGUARDANDO_PECA: 'bg-amarelo-bg text-amarelo',
  AGUARDANDO_APROVACAO: 'bg-amarelo-bg text-amarelo',
  CONCLUIDA: 'bg-verde-bg text-verde',
  ENTREGUE: 'bg-linha text-grafite/60',
  CANCELADA: 'bg-vermelho-bg text-vermelho',
};

export const CORES_STATUS_ORCAMENTO: Record<string, string> = {
  RASCUNHO: 'bg-linha text-grafite/60',
  ENVIADO: 'bg-azul-bg text-azul',
  APROVADO: 'bg-verde-bg text-verde',
  RECUSADO: 'bg-vermelho-bg text-vermelho',
  EXPIRADO: 'bg-amarelo-bg text-amarelo',
};

// Agenda / visitas
export const horaBR = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export const diaLongoBR = (iso: string) => {
  const s = new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const LABEL_TIPO_VISITA: Record<string, string> = {
  REVISAO: 'Revisão',
  RETORNO: 'Retorno',
  ORCAMENTO: 'Orçamento',
  GARANTIA: 'Garantia',
};

export const LABEL_STATUS_VISITA: Record<string, string> = {
  AGENDADA: 'Agendada',
  CONFIRMADA: 'Confirmada',
  REALIZADA: 'Realizada',
  FALTOU: 'Faltou',
};

export const CORES_STATUS_VISITA: Record<string, string> = {
  AGENDADA: 'bg-azul-bg text-azul',
  CONFIRMADA: 'bg-verde-bg text-verde',
  REALIZADA: 'bg-linha text-grafite/60',
  FALTOU: 'bg-vermelho-bg text-vermelho',
};

export const LABEL_FORMA_PAGAMENTO: Record<string, string> = {
  A_VISTA: 'À vista',
  PIX: 'PIX',
  CARTAO: 'Cartão',
  PARCELADO: 'Parcelado',
  FIADO: 'Fiado',
};

export const LABEL_ORIGEM: Record<string, string> = {
  OS: 'Ordem de Serviço',
  VENDA_BALCAO: 'Venda no balcão',
  DESPESA: 'Despesa',
  APORTE: 'Aporte',
};
