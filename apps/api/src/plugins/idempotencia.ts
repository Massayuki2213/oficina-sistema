import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { AppError, COD } from '../lib/errors.js';

// ============================================================
// Idempotência dos POST (ADR 0011).
//
// O caso real: a atendente registra a venda, o servidor grava, mas a
// resposta se perde no Wi-Fi. A tela, sem saber, tenta de novo — e a
// venda sai duas vezes, com o estoque baixado duas vezes.
//
// A tela manda `Idempotency-Key` em todo POST e repete a MESMA chave
// quando precisa tentar de novo. Aqui:
//  - chave nova: reserva e deixa a operação seguir; a resposta de
//    sucesso fica guardada (24 h);
//  - chave já concluída: devolve a resposta guardada, sem executar nada;
//  - chave ainda em processamento: 409 OPERACAO_EM_ANDAMENTO (a tela espera);
//  - mesma chave com outro corpo ou outra rota: 422 CHAVE_REUTILIZADA.
// Recusa (4xx/5xx) não é guardada: a pessoa corrige e manda de novo.
// ============================================================

declare module 'fastify' {
  interface FastifyRequest {
    /** A chave desta requisição, já reservada (a resposta será guardada). */
    idempotencia?: { chave: string; usuarioId: string };
    /** A resposta é a guardada de uma requisição anterior (a auditoria não grava de novo). */
    respostaRepetida?: boolean;
  }
}

const CABECALHO = 'idempotency-key';
const FORMATO = /^[A-Za-z0-9_-]{16,100}$/;
const VALIDADE_MS = 24 * 60 * 60 * 1000;
/** Reserva sem resposta há mais que isto: o processo caiu no meio. Quem repetir, assume. */
const ABANDONADA_MS = 60 * 1000;

const hashDe = (rota: string, corpo: unknown) =>
  createHash('sha256').update(rota).update('\n').update(JSON.stringify(corpo ?? null)).digest('hex');

export function registrarIdempotencia(app: FastifyInstance) {
  // preHandler: depois da sessão (a chave é por pessoa) e da validação do corpo.
  app.addHook('preHandler', async (req, reply) => {
    const chave = req.headers[CABECALHO];
    if (req.method !== 'POST' || typeof chave !== 'string' || !req.usuario) return;
    if (!FORMATO.test(chave)) throw new AppError(400, 'Chave de idempotência inválida.', COD.VALIDACAO);

    const usuarioId = req.usuario.id;
    const rota = `POST ${req.url}`;
    const hashCorpo = hashDe(rota, req.body);
    const agora = new Date();

    // Faxina barata: as chaves vencidas saem a cada POST com chave.
    await prisma.chaveIdempotencia.deleteMany({ where: { criadaEm: { lt: new Date(agora.getTime() - VALIDADE_MS) } } });

    // INSERT ... ON CONFLICT DO NOTHING: quem chegar primeiro reserva a chave.
    const { count } = await prisma.chaveIdempotencia.createMany({
      data: [{ chave, usuarioId, rota, hashCorpo, criadaEm: agora }],
      skipDuplicates: true,
    });
    if (count === 1) {
      req.idempotencia = { chave, usuarioId };
      return;
    }

    const existente = await prisma.chaveIdempotencia.findUnique({ where: { usuarioId_chave: { usuarioId, chave } } });
    if (!existente || existente.status === null) {
      // Reserva órfã (o processo caiu no meio): quem repetir, assume.
      if (existente && agora.getTime() - existente.criadaEm.getTime() > ABANDONADA_MS) {
        const r = await prisma.chaveIdempotencia.updateMany({
          where: { usuarioId, chave, status: null, criadaEm: existente.criadaEm },
          data: { criadaEm: agora, rota, hashCorpo },
        });
        if (r.count === 1) {
          req.idempotencia = { chave, usuarioId };
          return;
        }
      }
      throw new AppError(409, 'Esta operação ainda está sendo processada. Aguarde um instante.', COD.OPERACAO_EM_ANDAMENTO);
    }
    if (existente.rota !== rota || existente.hashCorpo !== hashCorpo) {
      throw new AppError(422, 'Esta chave de idempotência já foi usada em outra operação.', COD.CHAVE_REUTILIZADA);
    }

    req.respostaRepetida = true;
    return reply
      .code(existente.status)
      .header('idempotent-replayed', 'true')
      .type('application/json; charset=utf-8')
      .send(existente.resposta ?? '');
  });

  // onSend: guarda a resposta de sucesso ANTES dela sair — quem repetir já a encontra.
  app.addHook('onSend', async (req, reply, payload) => {
    const id = req.idempotencia;
    if (!id) return payload;
    const where = { usuarioId_chave: { usuarioId: id.usuarioId, chave: id.chave } };
    const sucesso = reply.statusCode >= 200 && reply.statusCode < 300;
    if (sucesso && (payload === undefined || payload === null || typeof payload === 'string')) {
      await prisma.chaveIdempotencia.update({ where, data: { status: reply.statusCode, resposta: payload ?? '' } }).catch(() => {});
    } else {
      // Recusa (validação, senha do Dono, falta de peça) não é fato consumado:
      // libera a chave para a tela corrigir e mandar de novo.
      await prisma.chaveIdempotencia.delete({ where }).catch(() => {});
    }
    return payload;
  });
}
