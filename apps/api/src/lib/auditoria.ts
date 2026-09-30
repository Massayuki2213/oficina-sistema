import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import type { MudancaDTO } from '@hermes/shared';
import { prisma } from './prisma.js';
import { alvoDaRota, compararRetratos, tirarRetrato, type AlvoDoRetrato } from './retratos.js';

// ============================================================
// Log de auditoria — "quem fez o quê e quando" (seção 2 do
// PLANEJAMENTO.md). Resolve o clássico "quem apagou isso?".
//
// A gravação é um hook global, e não uma chamada espalhada por
// cada service. O motivo é cobertura: com dezenas de rotas, alguém
// vai esquecer de chamar em algum lugar — e um log com buraco é
// pior que não ter log, porque dá uma falsa sensação de rastreio.
// ============================================================

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Nome da ação no log quando o derivado da rota não diz o suficiente. */
    acao?: string;
    /** false: a rota não é auditada pelo hook (registra por conta própria). */
    auditar?: boolean;
  }
  interface FastifyRequest {
    /** Retrato do registro antes da alteração (ver lib/retratos.ts). */
    retratoAntes?: { alvo: AlvoDoRetrato; antes: Record<string, unknown> | null };
  }
}

/** Campos que nunca podem entrar no log, em qualquer nível do corpo. */
const SENSIVEIS = new Set([
  'senha',
  'senhaatual',
  'novasenha',
  'confirmarsenha',
  'senhahash',
  'senhadono', // RN-08: confirmação de desconto acima do teto
  'token',
]);

/** Campos grandes demais para o log e sem valor de rastreio. */
const VOLUMOSOS = new Set(['logo']);

/**
 * Dado pessoal de contato: o log registra que foi informado, não o valor
 * (LGPD — minimização; e a anonimização de um cliente não deixa rastro aqui).
 */
const PESSOAIS = new Set(['cpfcnpj', 'telefone', 'whatsapp', 'endereco', 'contatotelefone']);

const ACAO_POR_METODO: Record<string, string> = {
  POST: 'CRIAR',
  PUT: 'ALTERAR',
  PATCH: 'ALTERAR',
  DELETE: 'EXCLUIR',
};

/**
 * Troca o valor dos campos sensíveis por '***' e devolve o corpo limpo.
 * Percorre objetos e listas aninhados — senha não pode vazar em nenhum nível.
 */
function limpar(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 4 || valor === null || typeof valor !== 'object') return valor;
  if (Array.isArray(valor)) return valor.map((v) => limpar(v, profundidade + 1));

  const saida: Record<string, unknown> = {};
  for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
    const k = chave.toLowerCase();
    if (SENSIVEIS.has(k)) saida[chave] = '***';
    else if (VOLUMOSOS.has(k)) saida[chave] = v ? '[imagem]' : v;
    else if (PESSOAIS.has(k)) saida[chave] = v ? '(dado pessoal)' : v;
    else saida[chave] = limpar(v, profundidade + 1);
  }
  return saida;
}

/** Serializa o corpo para a coluna `detalhes`, com teto de tamanho. */
export function resumirCorpo(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Object.keys(body as object).length === 0) return null;
  try {
    const texto = JSON.stringify(limpar(body));
    return texto.length > 800 ? `${texto.slice(0, 800)}…` : texto;
  } catch {
    return null;
  }
}

/**
 * Lê a rota registrada (o padrão, não a URL) e extrai o que aconteceu.
 * `/api/clientes/:id`            DELETE → EXCLUIR  clientes   :id
 * `/api/orcamentos/:id/aprovar`  POST   → APROVAR  orcamentos :id
 * `/api/compras/acerto/:fornecedorId`   → ACERTO   compras    :fornecedorId
 */
export function descreverRota(metodo: string, rota: string, params: Record<string, string> = {}, acaoConfigurada?: string) {
  const partes = rota
    .replace(/^\/api(?=\/|$)/, '')
    .split('/')
    .filter(Boolean);
  const entidade = partes[0] ?? 'desconhecido';

  // O id principal é o :id; em rotas como /acerto/:fornecedorId, o único parâmetro.
  const entidadeId = params.id ?? Object.values(params)[0] ?? null;

  // Último segmento fixo depois da entidade vira a ação (aprovar, receber, status...).
  const fixos = partes.slice(1).filter((p) => !p.startsWith(':'));
  const sufixo = fixos[fixos.length - 1];
  const acao = acaoConfigurada ?? (sufixo ? sufixo.toUpperCase().replace(/-/g, '_') : (ACAO_POR_METODO[metodo] ?? metodo));

  return { entidade, entidadeId, acao };
}

/** O `id` de uma resposta JSON de criação ({ id, ... }), se houver. */
function idDaResposta(payload: unknown): string | null {
  if (typeof payload !== 'string' || !payload.startsWith('{')) return null;
  try {
    const corpo = JSON.parse(payload) as { id?: unknown };
    return typeof corpo.id === 'string' ? corpo.id : null;
  } catch {
    return null;
  }
}

/**
 * Grava uma linha no log. NUNCA lança: auditoria não pode derrubar a operação
 * de negócio que ela está observando. Falha vira aviso no log da aplicação.
 */
export async function registrar(
  dados: {
    usuarioId?: string | null;
    acao: string;
    entidade: string;
    entidadeId?: string | null;
    detalhes?: string | null;
    mudancas?: MudancaDTO[] | null;
  },
  aviso?: (msg: string) => void,
) {
  try {
    await prisma.logAuditoria.create({
      data: {
        usuarioId: dados.usuarioId ?? null,
        acao: dados.acao,
        entidade: dados.entidade,
        entidadeId: dados.entidadeId ?? null,
        detalhes: dados.detalhes ?? null,
        ...(dados.mudancas?.length ? { mudancas: dados.mudancas as unknown as Prisma.InputJsonValue } : {}),
      },
    });
  } catch (err) {
    aviso?.(`Falha ao gravar auditoria: ${(err as Error).message}`);
  }
}

/** Registra o login (sucesso ou falha) — chamado direto pela rota de auth. */
export async function registrarLogin(usuarioId: string | null, email: string, ok: boolean) {
  await registrar({
    usuarioId,
    acao: ok ? 'LOGIN' : 'LOGIN_FALHOU',
    entidade: 'auth',
    detalhes: JSON.stringify({ email }),
  });
}

/**
 * Pluga o hook global. Só grava alteração que deu certo (2xx): tentativa
 * barrada por permissão não é fato consumado, e encheria o log de ruído.
 */
export function plugarAuditoria(app: FastifyInstance) {
  const auditavel = (req: { method: string; routeOptions: { config?: { auditar?: boolean }; url?: string } }) =>
    !!ACAO_POR_METODO[req.method] && req.routeOptions.config?.auditar !== false && !!req.routeOptions.url?.startsWith('/api/');

  // Antes da alteração (já autenticada e validada): o retrato do registro,
  // para o log mostrar o valor anterior. Falhar aqui não barra a operação.
  app.addHook('preHandler', async (req) => {
    if (!auditavel(req)) return;
    const alvo = alvoDaRota(req.routeOptions.url!, (req.params ?? {}) as Record<string, string>);
    if (!alvo) return;
    try {
      req.retratoAntes = { alvo, antes: await tirarRetrato(alvo) };
    } catch (err) {
      req.log.warn(`Auditoria: não tirei o retrato de ${alvo.chave}: ${(err as Error).message}`);
    }
  });

  // onSend, e não onResponse: o log é gravado ANTES da resposta sair. Quem
  // recebeu "ok" já encontra a alteração no Histórico (e os testes também).
  app.addHook('onSend', async (req, reply, payload) => {
    // Resposta repetida pela idempotência: o fato já foi registrado na primeira vez.
    if (!auditavel(req) || reply.statusCode >= 300 || req.respostaRepetida) return payload;

    const config = req.routeOptions.config;
    const rota = descreverRota(req.method, req.routeOptions.url!, (req.params ?? {}) as Record<string, string>, config?.acao);
    const { entidade, acao } = rota;
    // Criação não tem :id na rota — o id do registro novo vem na resposta. Sem
    // ele, o log do cadastro ficaria solto (e a anonimização não o acharia).
    const entidadeId = rota.entidadeId ?? (req.method === 'POST' ? idDaResposta(payload) : null);

    let mudancas: MudancaDTO[] | null = null;
    if (req.retratoAntes) {
      const { alvo, antes } = req.retratoAntes;
      try {
        mudancas = compararRetratos(alvo.chave, antes, await tirarRetrato(alvo));
      } catch (err) {
        req.log.warn(`Auditoria: não comparei ${alvo.chave}: ${(err as Error).message}`);
      }
    }

    await registrar(
      { usuarioId: req.usuario?.id ?? null, acao, entidade, entidadeId, detalhes: resumirCorpo(req.body), mudancas },
      (msg) => req.log.warn(msg),
    );
    return payload;
  });
}
