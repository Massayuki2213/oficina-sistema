import type { Pagina } from '@hermes/shared';
import type { PaginacaoQuery } from '@hermes/shared/schemas';

// Paginação por página/tamanho. Com anos de uso, uma oficina junta
// milhares de OS — devolver tudo em cada lista deixaria a tela lenta.

export function paginar(q: Pick<PaginacaoQuery, 'pagina' | 'porPagina'>) {
  return { skip: (q.pagina - 1) * q.porPagina, take: q.porPagina };
}

export function pagina<T>(itens: T[], total: number, q: Pick<PaginacaoQuery, 'pagina' | 'porPagina'>): Pagina<T> {
  return { itens, total, pagina: q.pagina, porPagina: q.porPagina };
}

/** Termo de busca que parece placa ou documento: só letras/números, maiúsculo. */
export const termoCompacto = (busca: string) => busca.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Só os dígitos do termo (para telefone/CPF), ou null se tiver poucos para buscar. */
export function digitosDaBusca(busca: string, minimo = 3): string | null {
  const d = busca.replace(/\D/g, '');
  return d.length >= minimo ? d : null;
}
