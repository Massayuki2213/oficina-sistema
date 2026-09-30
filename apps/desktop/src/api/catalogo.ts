import { useQuery } from '@tanstack/react-query';
import type {
  CarroDTO,
  ClienteResumoDTO,
  MembroEquipeDTO,
  OficinaDTO,
  Pagina,
  Perfil,
  PecaDTO,
  ServicoDTO,
} from '@hermes/shared';
import { http } from './http';

// Consultas usadas por várias telas: os "escolher cliente/peça/serviço"
// dos formulários, a equipe e os dados da oficina (cabeçalho do documento).

export const buscarClientes = (busca: string) =>
  http.get<Pagina<ClienteResumoDTO>>('/clientes', { busca, porPagina: 8 }).then((p) => p.itens);

export const buscarCarros = (busca: string) => http.get<Pagina<CarroDTO>>('/carros', { busca, porPagina: 8 }).then((p) => p.itens);

export const buscarServicos = (busca: string) =>
  http.get<Pagina<ServicoDTO>>('/servicos', { busca, porPagina: 10 }).then((p) => p.itens);

export const buscarPecas = (busca: string) => http.get<Pagina<PecaDTO>>('/pecas', { busca, porPagina: 10 }).then((p) => p.itens);

/** Veículos de um cliente (para escolher depois de escolher o dono). */
export function useCarrosDoCliente(clienteId: string | null | undefined) {
  return useQuery({
    queryKey: ['carros', 'doCliente', clienteId],
    queryFn: () => http.get<Pagina<CarroDTO>>('/carros', { clienteId: clienteId!, porPagina: 50 }).then((p) => p.itens),
    enabled: !!clienteId,
  });
}

/** Quem está ativo na equipe (ex.: os mecânicos para atribuir a OS). */
export function useEquipe(perfil?: Perfil) {
  return useQuery({
    queryKey: ['equipe', perfil ?? 'todos'],
    queryFn: () => http.get<MembroEquipeDTO[]>('/usuarios/equipe', { perfil }),
    staleTime: 5 * 60_000,
  });
}

export const OFICINA_PADRAO: OficinaDTO = {
  versao: 0,
  nome: 'Oficina',
  subtitulo: null,
  cnpj: null,
  telefone: null,
  email: null,
  endereco: null,
  logo: null,
  observacoesDocumento: null,
  margemPadrao: 80,
  descontoMaxSemSenha: 10,
  garantiaDias: 15,
  validadeOrcamentoDias: 15,
};

/** Dados da oficina — mudam raramente; o documento impresso usa o nome e o logo. */
export function useOficina() {
  const q = useQuery({ queryKey: ['oficina'], queryFn: () => http.get<OficinaDTO>('/oficina'), staleTime: 10 * 60_000 });
  return q.data ?? OFICINA_PADRAO;
}
