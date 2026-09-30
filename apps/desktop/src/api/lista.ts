import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Pagina } from '@hermes/shared';
import { http } from './http';

type Filtros = Record<string, string | number | boolean | null | undefined>;

/**
 * Lista paginada com busca: guarda página e termo, volta para a página 1
 * quando a busca ou um filtro muda, e mantém a página anterior na tela
 * enquanto a próxima carrega (sem "piscar" vazio).
 *
 * `chave` é a primeira parte da chave de cache — a mesma que as ações
 * invalidam (ex.: ['ordens']).
 */
export function useListaPaginada<T, Extra = object>(chave: string, caminho: string, filtros: Filtros = {}, porPagina = 25) {
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState('');
  const assinatura = JSON.stringify(filtros);

  useEffect(() => setPagina(1), [busca, assinatura]);

  const consulta = useQuery({
    queryKey: [chave, 'lista', caminho, { pagina, porPagina, busca, ...filtros }],
    queryFn: () => http.get<Pagina<T> & Extra>(caminho, { pagina, porPagina, busca, ...filtros }),
    placeholderData: keepPreviousData,
  });

  return { consulta, dados: consulta.data, pagina, setPagina, porPagina, busca, setBusca: useCallback((b: string) => setBusca(b), []) };
}

/**
 * Parâmetro da URL que abre uma janela (?abrir=<id>, ?nova=1).
 * Permite que outras telas mandem direto para "a OS 123" ou "nova OS".
 */
export function useParametroDeTela(nome: string): [string | null, () => void, URLSearchParams] {
  const [params, setParams] = useSearchParams();
  const valor = params.get(nome);
  const limpar = useCallback(() => {
    setParams(
      (p) => {
        const novo = new URLSearchParams(p);
        novo.delete(nome);
        // Parâmetros que acompanham a abertura (ex.: &carro=) saem junto.
        for (const extra of ['carro', 'placa', 'cliente']) novo.delete(extra);
        return novo;
      },
      { replace: true },
    );
  }, [nome, setParams]);
  return [valor, limpar, params];
}

/**
 * Todas as páginas de uma lista (para exportar planilha). Vai de 100 em 100
 * até acabar — com um teto, para um filtro esquecido não travar a tela.
 */
export async function buscarTodas<T>(caminho: string, filtros: Filtros = {}, teto = 5000): Promise<T[]> {
  const todas: T[] = [];
  for (let pagina = 1; todas.length < teto; pagina++) {
    const p = await http.get<Pagina<T>>(caminho, { ...filtros, pagina, porPagina: 100 });
    todas.push(...p.itens);
    if (p.itens.length < 100 || todas.length >= p.total) break;
  }
  return todas;
}
