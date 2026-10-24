// ============================================================
// Cria o Dono pelo terminal do servidor: o primeiro acesso de um servidor
// na internet (PRIMEIRO_ACESSO_WEB=false), onde quem abrisse o endereço
// primeiro viraria dono do sistema. Mesmas regras do primeiro acesso da
// tela (nome da oficina, e-mail, senha de 8+ caracteres) e só com o banco
// sem nenhum usuário.
//
// A senha vem pela entrada padrão, nunca por argumento (ficaria no
// histórico do terminal e na lista de processos). O jeito normal de rodar
// é o ops/criar-dono.sh, que pergunta tudo:
//
//   printf '%s\n' "$SENHA" | docker compose -f docker-compose.prod.yml exec -T app \
//     node dist/criar-dono.js --oficina "Oficina X" --nome "João" --email dono@oficina.com
// ============================================================

import { parseArgs } from 'node:util';
import { primeiroAcessoSchema } from '@hermes/shared/schemas';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { primeiroAcesso } from '../modules/auth/auth.service.js';

async function lerSenha() {
  let texto = '';
  for await (const parte of process.stdin) texto += String(parte);
  return texto.replace(/\r?\n$/, '');
}

async function main() {
  const { values } = parseArgs({
    options: { oficina: { type: 'string' }, nome: { type: 'string' }, email: { type: 'string' } },
  });
  const dados = primeiroAcessoSchema.safeParse({
    oficinaNome: values.oficina,
    nome: values.nome,
    email: values.email,
    senha: await lerSenha(),
  });
  if (!dados.success) {
    for (const problema of dados.error.issues) console.error(`- ${problema.message}`);
    process.exitCode = 2;
    return;
  }

  const dono = await primeiroAcesso(dados.data);
  await prisma.logAuditoria.create({
    data: {
      acao: 'PRIMEIRO_ACESSO_CLI',
      entidade: 'usuarios',
      entidadeId: dono.id,
      usuarioId: dono.id,
      detalhes: 'Dono criado pela linha de comando do servidor',
    },
  });
  console.error(`Dono criado: ${dono.nome} <${dono.email}>. Entre pelo navegador com esse e-mail e a senha digitada.`);
}

main()
  .catch((e) => {
    console.error(e instanceof AppError ? e.message : `Falhou: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
