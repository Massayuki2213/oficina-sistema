import type { FastifyReply, FastifyRequest } from 'fastify';
import { pode, type Perfil, type Permissoes } from '@hermes/shared';

// Conteúdo que vai dentro do token JWT.
export interface JwtPayload {
  sub: string; // id do usuário
  nome: string;
  perfil: Perfil;
}

// Ensina o @fastify/jwt a tipar request.user com o nosso payload.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

// preHandler: exige um token válido. Sem ele → 401.
export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ message: 'Não autenticado. Faça login.' });
  }
}

// preHandler que exige uma permissão do perfil (seção 2 do PLANEJAMENTO.md).
// Use sempre depois de `authenticate` (precisa do req.user preenchido).
export function requirePermission(acao: keyof Permissoes) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const perfil = req.user?.perfil;
    if (!perfil || !pode(perfil, acao)) {
      return reply.code(403).send({ message: 'Você não tem permissão para esta ação.' });
    }
  };
}
