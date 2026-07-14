import type { FastifyInstance } from 'fastify';
import { authenticate, requirePermission } from '../../lib/auth.js';
import {
  createUsuarioSchema,
  updateUsuarioSchema,
  resetSenhaSchema,
  ativoSchema,
  trocarSenhaSchema,
} from './usuarios.schema.js';
import * as service from './usuarios.service.js';

export async function usuariosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // PATCH /usuarios/minha-senha — qualquer perfil troca a própria senha.
  // Vem antes das rotas do Dono de propósito: não exige gerenciarUsuarios.
  app.patch('/minha-senha', async (req, reply) => {
    const parsed = trocarSenhaSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    await service.trocarPropriaSenha(req.user.sub, parsed.data.senhaAtual, parsed.data.novaSenha);
    return reply.code(204).send();
  });

  // Daqui para baixo: só o Dono administra usuários.
  const soDono = { preHandler: [requirePermission('gerenciarUsuarios')] };

  // GET /usuarios — todos, inclusive inativos
  app.get('/', soDono, async () => service.listUsuarios());

  // POST /usuarios — cadastra quem entra no sistema
  app.post('/', soDono, async (req, reply) => {
    const parsed = createUsuarioSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    return reply.code(201).send(await service.createUsuario(parsed.data));
  });

  // PUT /usuarios/:id — nome, e-mail e perfil
  app.put('/:id', soDono, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateUsuarioSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    return service.updateUsuario(id, parsed.data);
  });

  // PATCH /usuarios/:id/senha — o Dono redefine a senha de quem esqueceu
  app.patch('/:id/senha', soDono, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = resetSenhaSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    await service.resetSenha(id, parsed.data.senha);
    return reply.code(204).send();
  });

  // PATCH /usuarios/:id/ativo — liga/desliga o acesso (não apaga: o histórico aponta para ele)
  app.patch('/:id/ativo', soDono, async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = ativoSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ message: 'Dados inválidos', erros: parsed.error.flatten().fieldErrors });
    }
    return service.setAtivo(id, parsed.data.ativo, req.user.sub);
  });
}
