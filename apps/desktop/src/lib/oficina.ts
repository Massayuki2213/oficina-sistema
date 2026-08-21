import { api } from './api';

// Dados da oficina (Configurações). Ficam em cache no módulo porque o cabeçalho
// do documento impresso precisa deles de forma síncrona, na hora de imprimir.

export interface Oficina {
  nome: string;
  subtitulo: string | null;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  logo: string | null;
  margemPadrao: number;
  descontoMaxSemSenha: number;
  garantiaDias: number;
}

const PADRAO: Oficina = {
  nome: 'Minha Oficina',
  subtitulo: null,
  cnpj: null,
  telefone: null,
  email: null,
  endereco: null,
  logo: null,
  margemPadrao: 80,
  descontoMaxSemSenha: 10,
  garantiaDias: 15,
};

let cache: Oficina = PADRAO;

export function oficinaAtual(): Oficina {
  return cache;
}

/** Carrega do servidor. Chamado no login e ao salvar Configurações. */
export async function carregarOficina(): Promise<Oficina> {
  try {
    cache = await api<Oficina>('/oficina');
  } catch {
    // Sem conexão o documento sai com o padrão, em vez de quebrar a impressão.
  }
  return cache;
}

export function definirOficina(o: Oficina) {
  cache = o;
}

/** Linha de contato do cabeçalho: junta o que estiver preenchido. */
export function linhaContato(o: Oficina): string {
  return [o.telefone, o.endereco, o.cnpj ? `CNPJ ${o.cnpj}` : null].filter(Boolean).join(' · ');
}
