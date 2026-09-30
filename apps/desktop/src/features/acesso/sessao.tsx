import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Permissao, SituacaoSistema, UsuarioSessao } from '@hermes/shared';
import type { LoginInput, PrimeiroAcessoInput } from '@hermes/shared/schemas';
import { ApiError, EVENTO_SESSAO_ENCERRADA, http } from '../../api/http';

// ============================================================
// Sessão do usuário. O token vive num cookie httpOnly que a tela
// não enxerga: para saber quem está logado, pergunta ao servidor
// (/api/auth/me). Recarregar a página não perde a sessão.
// ============================================================

interface Sessao {
  usuario: UsuarioSessao | null;
  situacao: SituacaoSistema | null;
  carregando: boolean;
  /** Sem conexão com o servidor na abertura. */
  semServidor: boolean;
  entrar: (dados: LoginInput) => Promise<void>;
  primeiroAcesso: (dados: PrimeiroAcessoInput) => Promise<void>;
  sair: () => Promise<void>;
  pode: (p: Permissao) => boolean;
}

const Ctx = createContext<Sessao | null>(null);

export function useSessao() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSessao precisa estar dentro do <SessaoProvider>');
  return s;
}

const CHAVE_ME = ['sessao', 'me'];
const CHAVE_SITUACAO = ['sessao', 'situacao'];

async function buscarMe(): Promise<UsuarioSessao | null> {
  try {
    return await http.get<UsuarioSessao>('/auth/me');
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export function SessaoProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const situacao = useQuery({ queryKey: CHAVE_SITUACAO, queryFn: () => http.get<SituacaoSistema>('/auth/situacao'), staleTime: 60_000 });
  const me = useQuery({ queryKey: CHAVE_ME, queryFn: buscarMe, staleTime: 5 * 60_000, retry: 1 });

  const derrubar = useCallback(() => {
    // Some tudo que estava em cache do usuário anterior — nada vaza para o próximo.
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'sessao' });
    qc.setQueryData(CHAVE_ME, null);
  }, [qc]);

  useEffect(() => {
    window.addEventListener(EVENTO_SESSAO_ENCERRADA, derrubar);
    return () => window.removeEventListener(EVENTO_SESSAO_ENCERRADA, derrubar);
  }, [derrubar]);

  const valor = useMemo<Sessao>(() => {
    const usuario = me.data ?? null;
    return {
      usuario,
      situacao: situacao.data ?? null,
      carregando: me.isPending || situacao.isPending,
      semServidor: (me.isError || situacao.isError) && !usuario,
      async entrar(dados) {
        const r = await http.post<{ usuario: UsuarioSessao }>('/auth/login', dados);
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'sessao' });
        qc.setQueryData(CHAVE_ME, r.usuario);
      },
      async primeiroAcesso(dados) {
        const r = await http.post<{ usuario: UsuarioSessao }>('/auth/primeiro-acesso', dados);
        qc.setQueryData(CHAVE_ME, r.usuario);
        await qc.invalidateQueries({ queryKey: CHAVE_SITUACAO });
      },
      async sair() {
        await http.post('/auth/logout').catch(() => undefined);
        derrubar();
      },
      pode: (p) => !!usuario?.permissoes[p],
    };
  }, [me.data, me.isPending, me.isError, situacao.data, situacao.isPending, situacao.isError, qc, derrubar]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
