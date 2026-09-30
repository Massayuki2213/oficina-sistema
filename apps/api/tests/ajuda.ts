import { PrismaClient, type PerfilUsuario } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PERMISSOES, type UsuarioSessao } from '@hermes/shared';
import { URL_TESTE } from './banco-teste.js';

// Cliente próprio dos testes, como DONO do banco de teste: monta cenários e
// faz a faxina (TRUNCATE), que o usuário da aplicação não pode fazer.
export const db = new PrismaClient({ datasourceUrl: URL_TESTE });

export const DIA = 24 * 60 * 60 * 1000;
export const SENHA_PADRAO = 'senha-de-teste';

/**
 * Zera os dados de domínio entre os testes, mantendo os usuários.
 * TRUNCATE ... RESTART IDENTITY deixa a numeração de OS/orçamento previsível.
 */
export async function limparDominio() {
  await db.$executeRawUnsafe(`TRUNCATE TABLE
    "sessoes","chaves_idempotencia","logs_auditoria","movimentos_estoque","contas_receber","despesas","lancamentos_caixa",
    "compra_itens","compras","venda_itens","vendas","visitas","os_pecas","os_servicos","ordens_servico",
    "orcamento_pecas","orcamento_servicos","orcamentos","carros","pecas","servicos",
    "fornecedores","clientes"
    RESTART IDENTITY CASCADE;`);
}

/** Configuração da oficina com os padrões do PLANEJAMENTO (RN-08 10%, RN-18 15 dias). */
export async function configPadrao(over: Partial<{ descontoMaxSemSenha: number; garantiaDias: number }> = {}) {
  const dados = { nome: 'Oficina de Teste', descontoMaxSemSenha: 10, garantiaDias: 15, validadeOrcamentoDias: 15, ...over };
  await db.oficina.upsert({ where: { id: 'unica' }, update: dados, create: { id: 'unica', ...dados } });
}

const hashPadrao = bcrypt.hashSync(SENHA_PADRAO, 4);

/** Garante um usuário de teste por perfil e devolve a "sessão" dele (o ator dos services). */
export async function usuario(perfil: PerfilUsuario, senha?: string): Promise<UsuarioSessao> {
  const email = `${perfil.toLowerCase()}.teste@hermes.local`;
  const senhaHash = senha ? await bcrypt.hash(senha, 4) : hashPadrao;
  const u = await db.usuario.upsert({
    where: { email },
    update: { senhaHash, ativo: true, perfil },
    create: { nome: `${perfil[0]}${perfil.slice(1).toLowerCase()} Teste`, email, senhaHash, perfil },
  });
  return { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, permissoes: PERMISSOES[u.perfil] };
}

/** Os três perfis de uma vez. */
export async function atores() {
  return {
    dono: await usuario('DONO'),
    atendente: await usuario('ATENDENTE'),
    mecanico: await usuario('MECANICO'),
  };
}

let seqPlaca = 1000;

/** Cenário mínimo: um cliente com um carro, um serviço e uma peça em estoque. */
export async function cenarioBase(opts: { estoque?: number; precoServico?: number; precoPeca?: number; custoPeca?: number } = {}) {
  const cliente = await db.cliente.create({ data: { nome: 'Cliente Teste', telefone: '11999990000' } });
  const carro = await db.carro.create({
    data: { clienteId: cliente.id, placa: `TST${seqPlaca++}`, marca: 'VW', modelo: 'Gol' },
  });
  const servico = await db.servico.create({ data: { nome: 'Troca de óleo', precoMaoDeObra: opts.precoServico ?? 100 } });
  const peca = await db.peca.create({
    data: {
      nome: 'Filtro de óleo',
      precoCusto: opts.custoPeca ?? 20,
      precoVenda: opts.precoPeca ?? 50,
      estoqueAtual: opts.estoque ?? 10,
      estoqueMinimo: 2,
    },
  });
  return { cliente, carro, servico, peca };
}

export type Base = Awaited<ReturnType<typeof cenarioBase>>;

export async function estoqueDe(pecaId: string) {
  return Number((await db.peca.findUniqueOrThrow({ where: { id: pecaId } })).estoqueAtual);
}

/** Data "AAAA-MM-DD" daqui a N dias. */
export const daquiDias = (n: number) => {
  const d = new Date(Date.now() + n * DIA);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
