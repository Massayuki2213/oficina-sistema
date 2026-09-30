import type { CodigoErro, ErroApi } from '@hermes/shared';

// ============================================================
// Cliente HTTP da API.
//
// A sessão é um cookie httpOnly que o navegador manda sozinho: o
// JavaScript da tela nunca vê nem guarda o token. As chamadas vão
// para /api na mesma origem (a própria API serve a tela; no
// desenvolvimento, o Vite faz o proxy).
// ============================================================

const BASE = `${(import.meta.env.VITE_API_URL as string | undefined) ?? ''}/api`;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public codigo?: CodigoErro,
    /** Erros por campo do formulário. */
    public erros?: Record<string, string[]>,
    public detalhes?: unknown,
  ) {
    super(message);
  }
}

/** Evento global: a sessão caiu (401). A tela volta para o login. */
export const EVENTO_SESSAO_ENCERRADA = 'hermes:sessao-encerrada';

/**
 * Evento global: alguém salvou antes (409 CONFLITO_EDICAO, ADR 0010). O que
 * está em cache ficou velho — o main.tsx recarrega, e quem reabrir o
 * formulário já vê a versão atual.
 */
export const EVENTO_DADOS_DESATUALIZADOS = 'hermes:dados-desatualizados';

type Query = Record<string, string | number | boolean | null | undefined>;

export function comQuery(caminho: string, query?: Query) {
  if (!query) return caminho;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  }
  const qs = p.toString();
  return qs ? `${caminho}?${qs}` : caminho;
}

/**
 * Chave de idempotência (ADR 0011): 128 bits aleatórios em hexadecimal.
 * `crypto.randomUUID` só existe em HTTPS; `getRandomValues` funciona também no
 * http:// da rede da oficina.
 */
export function novaChave(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** Tentativas de um POST: a rede falhou, ou a primeira ainda está sendo processada. */
const MAX_TENTATIVAS = 4;

async function requisitar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  // POST cria coisa (venda, recebimento, entrada no estoque): vai com uma chave
  // de idempotência, e a MESMA chave vai em toda tentativa. Se a primeira
  // chegou e só a resposta se perdeu, o servidor devolve a resposta dela em
  // vez de lançar a venda de novo.
  const chave = metodo === 'POST' ? novaChave() : null;
  const headers: Record<string, string> = {};
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  if (chave) headers['Idempotency-Key'] = chave;

  for (let tentativa = 1; ; tentativa++) {
    let res: Response;
    try {
      res = await fetch(BASE + caminho, {
        method: metodo,
        credentials: 'same-origin',
        headers,
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      });
    } catch {
      // Sem resposta: talvez nem tenha chegado, talvez só a resposta tenha se
      // perdido. Com a chave, repetir é seguro.
      if (chave && tentativa < MAX_TENTATIVAS) {
        await esperar(600 * tentativa);
        continue;
      }
      throw new ApiError(0, 'Sem conexão com o servidor. Verifique a rede e tente de novo.');
    }

    const texto = await res.text();
    let dados: unknown;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch {
      dados = null;
    }

    if (!res.ok) {
      const e = (dados ?? {}) as Partial<ErroApi>;
      // A primeira tentativa ainda está sendo gravada: espera e pergunta de novo.
      if (chave && e.codigo === 'OPERACAO_EM_ANDAMENTO' && tentativa < MAX_TENTATIVAS) {
        await esperar(600 * tentativa);
        continue;
      }
      // Só derruba a sessão quando havia uma (não na tentativa de login).
      if (res.status === 401 && !caminho.startsWith('/auth/login')) {
        window.dispatchEvent(new Event(EVENTO_SESSAO_ENCERRADA));
      }
      if (e.codigo === 'CONFLITO_EDICAO') window.dispatchEvent(new Event(EVENTO_DADOS_DESATUALIZADOS));
      const mensagem =
        e.message ??
        (res.status >= 500 ? 'O servidor não respondeu. Tente de novo em instantes.' : `Erro ${res.status} na requisição`);
      throw new ApiError(res.status, mensagem, e.codigo, e.erros, e.detalhes);
    }
    return dados as T;
  }
}

export const http = {
  get: <T>(caminho: string, query?: Query) => requisitar<T>('GET', comQuery(caminho, query)),
  post: <T>(caminho: string, corpo: unknown = {}) => requisitar<T>('POST', caminho, corpo),
  put: <T>(caminho: string, corpo: unknown) => requisitar<T>('PUT', caminho, corpo),
  patch: <T>(caminho: string, corpo: unknown = {}) => requisitar<T>('PATCH', caminho, corpo),
  delete: <T = void>(caminho: string) => requisitar<T>('DELETE', caminho),
};

/** Mensagem para o usuário a partir de qualquer erro. */
export function mensagemDeErro(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Algo deu errado. Tente de novo.';
}

/** Endereço absoluto de um recurso da API (para download de arquivo, por exemplo). */
export const urlDaApi = (caminho: string) => BASE + caminho;
