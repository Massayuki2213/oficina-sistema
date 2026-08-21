import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';

// ============================================================
// Carregamento de dados com erro VISÍVEL.
//
// O padrão antigo era `api(...).then(setX).catch(() => {})`: quando a
// rede ou a API falhava, a tela ficava vazia sem dizer nada, e o
// atendente concluía que os dados tinham sumido. Com o sistema indo
// para a nuvem, falha de rede deixa de ser hipótese — então todo
// carregamento passa a ter os três estados: carregando, erro e dados.
// ============================================================

export interface Recurso<T> {
  dados: T;
  carregando: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
}

function mensagemDe(err: unknown): string {
  if (err instanceof ApiError) {
    // 401 já derruba a sessão na camada de API; aqui é só não assustar.
    if (err.status === 401) return 'Sua sessão expirou. Entre de novo.';
    if (err.status >= 500) return 'O servidor não respondeu. Tente de novo em instantes.';
    return err.message;
  }
  // TypeError é o que o fetch lança quando não há rede/servidor.
  return 'Sem conexão com o servidor. Verifique a rede e tente de novo.';
}

/**
 * Busca uma rota e mantém carregando/erro/dados.
 *
 * `inicial` é o valor mostrado enquanto não há resposta — normalmente `[]`,
 * para a tela poder renderizar a tabela vazia sem tratar `null`.
 *
 * `deps` refaz a busca quando muda (filtro, período, aba).
 */
export function useRecurso<T>(rota: string | null, inicial: T, deps: unknown[] = []): Recurso<T> {
  const [dados, setDados] = useState<T>(inicial);
  const [carregando, setCarregando] = useState(rota !== null);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    if (rota === null) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      setDados(await api<T>(rota));
    } catch (err) {
      setErro(mensagemDe(err));
    } finally {
      setCarregando(false);
    }
    // A rota já carrega os filtros na query string, então ela é a dependência.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rota, ...deps]);

  useEffect(() => {
    void buscar();
  }, [buscar]);

  return { dados, carregando, erro, recarregar: buscar };
}

/**
 * Para listas auxiliares (combos de cliente, veículo, mecânico...).
 *
 * Aqui a falha não trava a tela, mas também não pode ser silenciosa: devolve
 * a mensagem para quem chamou avisar do jeito da tela — normalmente um toast.
 */
export async function buscarLista<T>(rota: string, aoFalhar: (msg: string) => void, inicial: T): Promise<T> {
  try {
    return await api<T>(rota);
  } catch (err) {
    aoFalhar(mensagemDe(err));
    return inicial;
  }
}
