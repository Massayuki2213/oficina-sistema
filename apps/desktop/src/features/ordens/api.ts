import { useCallback, useState } from 'react';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { OrdemServicoDTO } from '@hermes/shared';
import { http, mensagemDeErro } from '../../api/http';
import { foiDesistencia, useConfirmacoes, type Extras } from '../../api/acoes';
import { useAvisos } from '../../lib/avisos';

export const chaveOS = (id: string) => ['ordens', id] as const;

export function useOS(id: string | null) {
  return useQuery({
    queryKey: chaveOS(id ?? ''),
    queryFn: () => http.get<OrdemServicoDTO>(`/ordens/${id}`),
    enabled: !!id,
  });
}

/**
 * Executa uma ação sobre a OS aberta: trata as confirmações do servidor
 * (senha do Dono, peça em falta, fiado bloqueado), põe a OS devolvida na
 * tela e manda refazer as listas que a ação afetou.
 */
export function useAcaoNaOS(id: string) {
  const qc = useQueryClient();
  const avisos = useAvisos();
  const confirmar = useConfirmacoes();
  const [ocupado, setOcupado] = useState(false);

  const executar = useCallback(
    async (fazer: (extras: Extras) => Promise<OrdemServicoDTO>, opcoes: { sucesso?: string; invalidar?: QueryKey[] } = {}) => {
      setOcupado(true);
      try {
        const os = await confirmar(fazer);
        qc.setQueryData(chaveOS(id), os);
        await Promise.all(
          [['ordens'], ['pecas'], ['alertas'], ['orcamentos'], ...(opcoes.invalidar ?? [])].map((queryKey) =>
            qc.invalidateQueries({ queryKey }),
          ),
        );
        if (opcoes.sucesso) avisos.sucesso(opcoes.sucesso);
        return os;
      } catch (e) {
        if (!foiDesistencia(e)) avisos.erro(mensagemDeErro(e));
        return null;
      } finally {
        setOcupado(false);
      }
    },
    [id, qc, avisos, confirmar],
  );

  return { executar, ocupado };
}

export type AcaoNaOS = ReturnType<typeof useAcaoNaOS>['executar'];

/** Listas que mudam quando entra ou sai dinheiro. */
export const DINHEIRO: QueryKey[] = [['caixa'], ['contas-receber'], ['relatorios'], ['clientes']];
