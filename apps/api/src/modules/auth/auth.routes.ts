import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../lib/auth.js';
import { loginSchema } from './auth.schema.js';
import { validarCredenciais } from './auth.service.js';

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/login — troca e-mail+senha por um token JWT (RN da seção 2).
  app.post('/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }

    const usuario = await validarCredenciais(parsed.data.email, parsed.data.senha);
    if (!usuario) {
      return reply.code(401).send({ message: 'E-mail ou senha incorretos' });
    }

    const token = app.jwt.sign({ sub: usuario.id, nome: usuario.nome, perfil: usuario.perfil });
    return {
      token,
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil },
    };
  });

  // GET /auth/me — dados do usuário logado (a partir do token).
  app.get('/me', { preHandler: [authenticate] }, async (req) => {
    return req.user;
  });
}
