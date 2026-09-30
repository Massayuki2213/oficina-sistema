import { useCallback } from 'react';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { brl, formatarQtd, type FaltaEstoqueDTO, type SituacaoFiadoDTO } from '@hermes/shared';
import { createElement } from 'react';
import { ApiError, mensagemDeErro } from './http';
import { useAvisos } from '../lib/avisos';

// ============================================================
// Ações (tudo que muda dado no servidor).
//
// `useAcao` junta o que toda ação precisa: chamar a API, atualizar
// as listas que mudaram por causa dela e avisar o usuário.
//
// `useConfirmacoes` resolve de um jeito só os casos em que o servidor
// responde "confirme e mande de novo": senha do Dono (RN-08), peça em
// falta (RN-03), conflito de agenda (RN-19) e fiado bloqueado (RN-11.2).
// ============================================================

interface OpcoesAcao<R> {
  /** Listas/consultas a refazer quando der certo (a 1ª parte da chave basta: ['ordens']). */
  invalidar?: QueryKey[];
  sucesso?: string | ((r: R) => string);
  /** Erro vira aviso (padrão). Em formulário, deixe 'silencioso' e mostre no campo. */
  erro?: 'aviso' | 'silencioso';
}

export function useAcao<V, R>(fn: (vars: V) => Promise<R>, opcoes: OpcoesAcao<R> = {}) {
  const qc = useQueryClient();
  const avisos = useAvisos();
  return useMutation<R, unknown, V>({
    mutationFn: fn,
    onSuccess: async (r) => {
      await Promise.all((opcoes.invalidar ?? []).map((queryKey) => qc.invalidateQueries({ queryKey })));
      if (opcoes.sucesso) avisos.sucesso(typeof opcoes.sucesso === 'function' ? opcoes.sucesso(r) : opcoes.sucesso);
    },
    onError: (e) => {
      // O usuário desistiu numa confirmação: não é erro.
      if (e instanceof Desistiu || opcoes.erro === 'silencioso') return;
      avisos.erro(mensagemDeErro(e));
    },
  });
}

/** O que a tela manda de volta depois que o usuário confirma. */
export interface Extras {
  senhaDono?: string;
  confirmarSemEstoque?: boolean;
  ignorarConflito?: boolean;
  liberarFiado?: boolean;
}

/** O usuário desistiu na confirmação. */
export class Desistiu extends Error {}

function listaDeFaltas(faltas: FaltaEstoqueDTO[]) {
  return createElement(
    'ul',
    { className: 'mt-2 space-y-0.5' },
    faltas.map((f) =>
      createElement(
        'li',
        { key: f.pecaId },
        `${f.nome}: precisa de ${formatarQtd(f.necessario, f.unidade)}, há ${formatarQtd(f.disponivel, f.unidade)}`,
      ),
    ),
  );
}

export function useConfirmacoes() {
  const avisos = useAvisos();

  /**
   * Chama `tentar` e, se o servidor pedir confirmação, pergunta ao usuário
   * e tenta de novo com a resposta. Lança `Desistiu` se ele voltar atrás.
   */
  return useCallback(
    async function executar<T>(tentar: (extras: Extras) => Promise<T>): Promise<T> {
      const extras: Extras = {};
      for (let tentativa = 0; tentativa < 6; tentativa++) {
        try {
          return await tentar(extras);
        } catch (e) {
          if (!(e instanceof ApiError)) throw e;

          if (e.codigo === 'SENHA_DONO_NECESSARIA' || e.codigo === 'SENHA_DONO_INCORRETA') {
            const senha = await avisos.pedirSenha({
              titulo: 'Desconto acima do limite',
              mensagem: e.codigo === 'SENHA_DONO_NECESSARIA' ? e.message : 'Peça ao Dono para digitar a senha de novo.',
              erro: e.codigo === 'SENHA_DONO_INCORRETA' ? e.message : undefined,
            });
            if (senha === null) throw new Desistiu();
            extras.senhaDono = senha;
            continue;
          }

          if (e.codigo === 'ESTOQUE_INSUFICIENTE') {
            const faltas = (e.detalhes as FaltaEstoqueDTO[] | undefined) ?? [];
            const ok = await avisos.confirmar({
              titulo: 'Falta peça no estoque',
              mensagem: createElement(
                'div',
                null,
                'O sistema não tem a quantidade toda. Se a peça vai ser encomendada (ou está na mão e a contagem está errada), confirme para seguir.',
                faltas.length ? listaDeFaltas(faltas) : null,
              ),
              botao: 'Seguir mesmo assim',
            });
            if (!ok) throw new Desistiu();
            extras.confirmarSemEstoque = true;
            continue;
          }

          if (e.codigo === 'CONFLITO_AGENDA') {
            const ok = await avisos.confirmar({ titulo: 'Conflito de horário', mensagem: e.message, botao: 'Encaixar mesmo assim' });
            if (!ok) throw new Desistiu();
            extras.ignorarConflito = true;
            continue;
          }

          if (e.codigo === 'FIADO_BLOQUEADO') {
            const s = e.detalhes as SituacaoFiadoDTO | undefined;
            const ok = await avisos.confirmar({
              titulo: 'Cliente com fiado em atraso',
              mensagem: s
                ? `Há ${s.parcelasVencidas} parcela(s) vencida(s), somando ${brl(s.vencido)}. Liberar novo fiado é por sua conta — fica registrado no histórico.`
                : e.message,
              botao: 'Liberar mesmo assim',
              perigo: true,
            });
            if (!ok) throw new Desistiu();
            extras.liberarFiado = true;
            continue;
          }

          throw e;
        }
      }
      throw new Error('Não foi possível concluir. Tente de novo.');
    },
    [avisos],
  );
}

/** Para `onError`: desistência não é erro. */
export const foiDesistencia = (e: unknown) => e instanceof Desistiu;
