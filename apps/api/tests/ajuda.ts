import { PrismaClient } from '@prisma/client';

// Cliente próprio dos testes, apontado para o banco de teste pelo setup.
export const db = new PrismaClient();

/**
 * Zera os dados de domínio entre os testes, mantendo os usuários.
 * TRUNCATE ... RESTART IDENTITY deixa a numeração de OS/orçamento previsível,
 * o que importa quando o teste confere "OS #1".
 */
export async function limparDominio() {
  await db.$executeRawUnsafe(`TRUNCATE TABLE
    "logs_auditoria","movimentos_estoque","contas_receber","despesas","lancamentos_caixa",
    "compra_itens","compras","visitas","os_pecas","os_servicos","ordens_servico",
    "orcamento_pecas","orcamento_servicos","orcamentos","carros","pecas","servicos",
    "fornecedores","clientes"
    RESTART IDENTITY CASCADE;`);
}

/** Configuração da oficina com os padrões do PLANEJAMENTO (RN-08 10%, RN-18 15 dias). */
export async function configPadrao(over: Partial<{ descontoMaxSemSenha: number; garantiaDias: number }> = {}) {
  const dados = { nome: 'Oficina de Teste', descontoMaxSemSenha: 10, garantiaDias: 15, ...over };
  await db.oficina.upsert({ where: { id: 'unica' }, update: dados, create: { id: 'unica', ...dados } });
}

/** Cenário mínimo: um cliente com um carro, um serviço e uma peça em estoque. */
export async function cenarioBase(opts: { estoque?: number; precoServico?: number; precoPeca?: number } = {}) {
  const cliente = await db.cliente.create({ data: { nome: 'Cliente Teste', telefone: '11999990000' } });
  const carro = await db.carro.create({
    data: { clienteId: cliente.id, placa: `TST${Math.floor(Math.random() * 9000) + 1000}`, marca: 'VW', modelo: 'Gol' },
  });
  const servico = await db.servico.create({
    data: { nome: 'Troca de óleo', precoMaoDeObra: opts.precoServico ?? 100 },
  });
  const peca = await db.peca.create({
    data: {
      nome: 'Filtro de óleo',
      precoCusto: 20,
      precoVenda: opts.precoPeca ?? 50,
      estoqueAtual: opts.estoque ?? 10,
      estoqueMinimo: 2,
    },
  });
  return { cliente, carro, servico, peca };
}

/** Usuário Dono para as ações que exigem autoria/senha. */
export async function donoDeTeste(senha = 'senha-do-dono') {
  const bcrypt = await import('bcryptjs');
  return db.usuario.upsert({
    where: { email: 'dono.teste@hermes.local' },
    update: { senhaHash: await bcrypt.default.hash(senha, 10), ativo: true, perfil: 'DONO' },
    create: {
      nome: 'Dono Teste',
      email: 'dono.teste@hermes.local',
      senhaHash: await bcrypt.default.hash(senha, 10),
      perfil: 'DONO',
    },
  });
}

export const DIA = 24 * 60 * 60 * 1000;
