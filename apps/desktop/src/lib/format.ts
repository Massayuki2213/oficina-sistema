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
