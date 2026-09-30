// ============================================================
// Recuperação de acesso, pela linha de comando do servidor.
//
// Para quando o ÚNICO Dono esquece a senha (com dois Donos, um
// redefine a do outro pela tela). Quem roda isto já tem acesso ao
// servidor — é a mesma confiança de quem pode ler o banco.
//
//   docker compose -f docker-compose.prod.yml exec app node dist/redefinir-senha.js <email> <nova-senha>
//   (desenvolvimento: npm run senha:redefinir -w @hermes/api -- <email> <nova-senha>)
// ============================================================

import { senhaNova } from '@hermes/shared/schemas';
import { prisma } from '../lib/prisma.js';
import { hashSenha } from '../modules/auth/auth.service.js';

async function main() {
  const [email, senha] = process.argv.slice(2);
  if (!email || !senha) {
    console.error('Uso: redefinir-senha <email> <nova-senha>');
    process.exit(2);
  }
  const valida = senhaNova.safeParse(senha);
  if (!valida.success) {
    console.error(`Senha recusada: ${valida.error.issues[0]?.message}`);
    process.exit(2);
  }

  const usuario = await prisma.usuario.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!usuario) {
    console.error(`Nenhum usuário com o e-mail ${email}.`);
    process.exit(1);
  }

  // Nova senha, sessões antigas derrubadas, e o acesso volta se estava inativo.
  await prisma.usuario.update({ where: { id: usuario.id }, data: { senhaHash: await hashSenha(senha), ativo: true } });
  await prisma.sessao.deleteMany({ where: { usuarioId: usuario.id } });
  await prisma.logAuditoria.create({
    data: { acao: 'REDEFINIR_SENHA_CLI', entidade: 'usuarios', entidadeId: usuario.id, detalhes: 'Senha redefinida pela linha de comando do servidor' },
  });
  console.log(`Senha de ${usuario.nome} (${usuario.email}) redefinida. Já pode entrar com a nova senha.`);
}

main()
  .catch((e) => {
    console.error('Falhou:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
