import type { FastifyInstance, FastifyError } from 'fastify';
import { Prisma } from '@prisma/client';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import type { ErroApi } from '@hermes/shared';
import { AppError, COD } from '../lib/errors.js';

// ============================================================
// Tratador global de erros: tudo que dá errado vira o mesmo
// formato ({ message, codigo?, erros?, detalhes? }), com uma
// mensagem que o balconista entende — nunca um stack trace.
// ============================================================

/** Unicidade violada: diz O QUE já existe, pelo campo que colidiu. */
const DUPLICADO: [RegExp, string][] = [
  [/placa/, 'Já existe um veículo com essa placa'],
  [/email/, 'Já existe um usuário com esse e-mail'],
  [/codigo_barras|codigoBarras/, 'Já existe uma peça com esse código de barras'],
  [/sku/, 'Já existe uma peça com esse SKU'],
  [/orcamento_id|orcamentoId/, 'Este orçamento já virou uma Ordem de Serviço'],
];

function mensagemDuplicado(err: Prisma.PrismaClientKnownRequestError): string {
  const alvo = JSON.stringify(err.meta?.target ?? '');
  return DUPLICADO.find(([re]) => re.test(alvo))?.[1] ?? 'Já existe um registro com esses dados';
}

/**
 * Nome da restrição CHECK que recusou a gravação, se foi isso (ver a migração
 * restricoes_check). O Prisma não tem código próprio para ela: vem no texto.
 */
function restricaoRecusada(err: unknown): string | null {
  if (!(err instanceof Prisma.PrismaClientUnknownRequestError || err instanceof Prisma.PrismaClientKnownRequestError)) {
    return null;
  }
  return /violates check constraint \\?"([^"\\]+)\\?"/.exec(err.message)?.[1] ?? null;
}

/** "/itens/0/quantidade" → "itens.0.quantidade" (a chave que o formulário usa). */
const campoDoCaminho = (instancePath: string) => instancePath.replace(/^\//, '').replace(/\//g, '.') || '_';

export function registrarTratamentoDeErros(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError, req, reply) => {
    // 1. Corpo/query fora do contrato (Zod).
    if (hasZodFastifySchemaValidationErrors(error)) {
      const erros: Record<string, string[]> = {};
      for (const v of error.validation) {
        (erros[campoDoCaminho(v.instancePath)] ??= []).push(v.message ?? 'Valor inválido');
      }
      const corpo: ErroApi = {
        // A primeira mensagem já diz o que corrigir — melhor que "dados inválidos".
        message: error.validation[0]?.message ?? 'Dados inválidos',
        codigo: COD.VALIDACAO,
        erros,
      };
      return reply.code(400).send(corpo);
    }

    // 2. Regra de negócio.
    if (error instanceof AppError) {
      const corpo: ErroApi = {
        message: error.message,
        ...(error.codigo ? { codigo: error.codigo } : {}),
        ...(error.detalhes !== undefined ? { detalhes: error.detalhes } : {}),
      };
      return reply.code(error.statusCode).send(corpo);
    }

    // 3. Banco: registro sumiu, duplicado, ou ligado a outro.
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return reply.code(404).send({ message: 'Registro não encontrado', codigo: COD.NAO_ENCONTRADO } satisfies ErroApi);
      }
      if (error.code === 'P2002') {
        return reply.code(409).send({ message: mensagemDuplicado(error), codigo: COD.CONFLITO } satisfies ErroApi);
      }
      if (error.code === 'P2003') {
        return reply
          .code(409)
          .send({ message: 'Este registro está ligado a outro e não pode ser alterado assim', codigo: COD.CONFLITO } satisfies ErroApi);
      }
    }

    // 3b. Restrição do banco (a última linha de defesa): passou pela validação
    // algo que nunca deveria existir — é bug, e fica no log. Só o NOME da
    // restrição: a mensagem do banco traz a linha recusada, com dado de cliente.
    const restricao = restricaoRecusada(error);
    if (restricao) {
      req.log.warn({ restricao }, 'o banco recusou uma gravação fora das regras');
      return reply
        .code(400)
        .send({ message: 'Valor fora do permitido: nada foi gravado. Confira os valores e tente de novo.', codigo: COD.VALIDACAO } satisfies ErroApi);
    }

    // 4. Proteções do servidor.
    if (error.statusCode === 429) {
      return reply
        .code(429)
        .send({ message: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.', codigo: COD.MUITAS_TENTATIVAS } satisfies ErroApi);
    }

    const status = typeof error.statusCode === 'number' && error.statusCode >= 400 ? error.statusCode : 500;
    if (status >= 500) req.log.error({ err: error }, 'erro não tratado');

    // JSON malformado, corpo grande demais etc. — erros do próprio Fastify.
    const mensagem =
      status >= 500
        ? 'Erro interno no servidor. Tente de novo; se continuar, avise o responsável pelo sistema.'
        : status === 413
          ? 'Arquivo ou conteúdo grande demais'
          : status === 415
            ? 'Formato de envio não suportado'
            : 'Requisição inválida';
    return reply.code(status).send({ message: mensagem } satisfies ErroApi);
  });
}
