import type { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from './prisma.js';

// ============================================================
// Log de auditoria — "quem fez o quê e quando" (seção 2 do
// PLANEJAMENTO.md). Resolve o clássico "quem apagou isso?".
//
// A gravação é um hook global, e não uma chamada espalhada por
// cada service. O motivo é cobertura: com 17 módulos, alguém vai
// esquecer de chamar em algum lugar — e um log com buraco é pior
// que não ter log, porque dá uma falsa sensação de rastreio.
// ============================================================

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

/** Rotas que não são alteração de negócio (ou que se auditam sozinhas). */
const IGNORADAS = [/^\/auth\/login\b/, /^\/health\b/];

const ACAO_POR_METODO: Record<string, string> = {
  POST: 'CRIAR',
  PUT: 'ALTERAR',
  PATCH: 'ALTERAR',
  DELETE: 'EXCLUIR',
};

/** Um cuid tem 25 chars e começa com 'c'; ids numéricos também são id. */
function pareceId(seg: string) {
  return /^c[a-z0-9]{20,}$/i.test(seg) || /^\d+$/.test(seg);
}

/**
 * Troca o valor dos campos sensíveis por '***' e devolve o corpo em texto.
 * Percorre objetos e listas aninhados — senha não pode vazar em nenhum nível.
 */
function limpar(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 4 || valor === null || typeof valor !== 'object') return valor;
  if (Array.isArray(valor)) return valor.map((v) => limpar(v, profundidade + 1));

  const saida: Record<string, unknown> = {};
  for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
    saida[chave] = SENSIVEIS.has(chave.toLowerCase()) ? '***' : limpar(v, profundidade + 1);
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
 * Lê a rota e extrai o que aconteceu.
 * `/clientes/abc123`             → EXCLUIR  clientes  abc123
 * `/orcamentos/abc123/aprovar`   → APROVAR  orcamentos abc123
 * `/compras/acerto/abc123`       → ACERTO   compras   abc123
 */
export function descreverRota(metodo: string, url: string) {
  const caminho = url.split('?')[0];
  const partes = caminho.split('/').filter(Boolean);

  const entidade = partes[0] ?? 'desconhecido';

  // O id pode não vir logo depois da entidade: em /compras/acerto/:fornecedorId
  // ele é o terceiro segmento. Por isso procura o id em qualquer posição.
  const entidadeId = partes.slice(1).filter(pareceId).pop() ?? null;

  // Último segmento que não é id vira a ação (aprovar, receber, pagar, status...).
  const sufixo = partes.slice(1).filter((p) => !pareceId(p)).pop();
  const acao = sufixo ? sufixo.toUpperCase().replace(/-/g, '_') : (ACAO_POR_METODO[metodo] ?? metodo);

  return { entidade, entidadeId, acao };
}

/**
 * Grava uma linha no log. NUNCA lança: auditoria não pode derrubar a operação
 * de negócio que ela está observando. Falha vira aviso no log da aplicação.
 */
export async function registrar(
  dados: { usuarioId?: string | null; acao: string; entidade: string; entidadeId?: string | null; detalhes?: string | null },
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
  app.addHook('onResponse', async (req: FastifyRequest, reply) => {
    if (!ACAO_POR_METODO[req.method]) return;
    if (reply.statusCode >= 300) return;
    if (IGNORADAS.some((r) => r.test(req.url))) return;

    const { entidade, entidadeId, acao } = descreverRota(req.method, req.url);
    await registrar(
      { usuarioId: req.user?.sub ?? null, acao, entidade, entidadeId, detalhes: resumirCorpo(req.body) },
      (msg) => req.log.warn(msg),
    );
  });
}
