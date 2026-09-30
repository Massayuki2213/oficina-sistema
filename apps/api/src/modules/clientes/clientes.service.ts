import type { Cliente, Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { ClienteDTO, ClienteFichaDTO, ClienteResumoDTO, Pagina, VeiculoResumoDTO } from '@hermes/shared';
import type { clienteSchema, listarClientesQuery } from '@hermes/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { conflito, naoEncontrado } from '../../lib/errors.js';
import { falhaDeVersao, naVersao, proximaVersao } from '../../lib/versao.js';
import { num } from '../../lib/dinheiro.js';
import { digitosDaBusca, pagina, paginar, termoCompacto } from '../../lib/paginacao.js';
import { situacaoFiado } from '../../dominio/fiado.js';
import { incluirOSResumo, paraOSResumo } from '../ordens/ordens.mapper.js';
import { incluirParcela, paraParcela } from '../contas/contas.mapper.js';

type DadosCliente = z.output<typeof clienteSchema>;

const contarVeiculos = { _count: { select: { carros: { where: { ativo: true } } } } } as const;

function paraResumo(c: Cliente & { _count: { carros: number } }): ClienteResumoDTO {
  return {
    id: c.id,
    versao: c.versao,
    nome: c.nome,
    tipo: c.tipo,
    cpfCnpj: c.cpfCnpj,
    telefone: c.telefone,
    whatsapp: c.whatsapp,
    email: c.email,
    qtdVeiculos: c._count.carros,
  };
}

function paraDTO(c: Cliente & { _count: { carros: number } }): ClienteDTO {
  return {
    ...paraResumo(c),
    endereco: c.endereco,
    observacoes: c.observacoes,
    ativo: c.ativo,
    dataCadastro: c.dataCadastro.toISOString(),
  };
}

export function paraVeiculoResumo(v: {
  id: string;
  placa: string;
  marca: string;
  modelo: string;
  ano: number | null;
  cor: string | null;
  kmAtual: number | null;
  combustivel: string | null;
}): VeiculoResumoDTO {
  return {
    id: v.id,
    placa: v.placa,
    marca: v.marca,
    modelo: v.modelo,
    ano: v.ano,
    cor: v.cor,
    kmAtual: v.kmAtual,
    combustivel: v.combustivel,
  };
}

/**
 * Busca por nome, e-mail, documento, telefone ou placa de um dos veículos.
 * "12345" acha o CPF 123.456..., o telefone ...12345 e nada mais; "abc1d" acha a placa.
 */
function filtroDeBusca(busca?: string): Prisma.ClienteWhereInput {
  if (!busca) return {};
  const digitos = digitosDaBusca(busca);
  const compacto = termoCompacto(busca);
  const pareceplaca = compacto.length >= 3 && /[A-Z]/.test(compacto) && /\d/.test(compacto);

  return {
    OR: [
      { nome: { contains: busca, mode: 'insensitive' } },
      { email: { contains: busca, mode: 'insensitive' } },
      ...(digitos
        ? [{ cpfCnpj: { contains: digitos } }, { telefone: { contains: digitos } }, { whatsapp: { contains: digitos } }]
        : []),
      ...(pareceplaca ? [{ carros: { some: { placa: { contains: compacto }, ativo: true } } }] : []),
    ],
  };
}

export async function listar(q: z.output<typeof listarClientesQuery>): Promise<Pagina<ClienteResumoDTO>> {
  const where: Prisma.ClienteWhereInput = { ativo: true, ...filtroDeBusca(q.busca) };
  const [itens, total] = await prisma.$transaction([
    prisma.cliente.findMany({ where, orderBy: { nome: 'asc' }, include: contarVeiculos, ...paginar(q) }),
    prisma.cliente.count({ where }),
  ]);
  return pagina(itens.map(paraResumo), total, q);
}

/** Ficha do cliente: veículos, últimas OS, fiado em aberto e quanto já gastou (RN-16/17). */
export async function ficha(id: string): Promise<ClienteFichaDTO> {
  const c = await prisma.cliente.findUnique({
    where: { id },
    include: {
      ...contarVeiculos,
      carros: { where: { ativo: true }, orderBy: { placa: 'asc' } },
      ordens: { orderBy: { dataAbertura: 'desc' }, take: 10, include: incluirOSResumo },
      contasReceber: { where: { status: 'PENDENTE' }, orderBy: { vencimento: 'asc' }, include: incluirParcela },
    },
  });
  if (!c) throw naoEncontrado('Cliente não encontrado');

  const [fiado, gasto] = await Promise.all([
    situacaoFiado(prisma, id),
    prisma.ordemServico.aggregate({ where: { clienteId: id, pago: true, garantia: false }, _sum: { total: true } }),
  ]);

  return {
    ...paraDTO(c),
    veiculos: c.carros.map(paraVeiculoResumo),
    ordens: c.ordens.map(paraOSResumo),
    parcelasEmAberto: c.contasReceber.map((p) => paraParcela(p)),
    fiado,
    totalGasto: num(gasto._sum.total),
  };
}

/** Mesmo CPF/CNPJ em dois cadastros ativos vira confusão no fiado e no histórico. */
async function conferirDocumentoUnico(cpfCnpj: string | null | undefined, ignorarId?: string) {
  if (!cpfCnpj) return;
  const outro = await prisma.cliente.findFirst({
    where: { cpfCnpj, ativo: true, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
    select: { nome: true },
  });
  if (outro) throw conflito(`Este CPF/CNPJ já está no cadastro de "${outro.nome}".`);
}

export async function criar(dados: DadosCliente): Promise<ClienteDTO> {
  await conferirDocumentoUnico(dados.cpfCnpj);
  const c = await prisma.cliente.create({ data: dados, include: contarVeiculos });
  return paraDTO(c);
}

export async function atualizar(id: string, { versao, ...dados }: DadosCliente): Promise<ClienteDTO> {
  await conferirDocumentoUnico(dados.cpfCnpj, id);
  const r = await prisma.cliente.updateMany({ where: { id, ...naVersao(versao) }, data: { ...dados, ...proximaVersao } });
  if (r.count === 0) await falhaDeVersao('clientes', id, (await prisma.cliente.count({ where: { id } })) > 0, 'Cliente não encontrado');
  return paraDTO(await prisma.cliente.findUniqueOrThrow({ where: { id }, include: contarVeiculos }));
}

async function conferirSemFiado(id: string, acao: string) {
  const pendentes = await prisma.contaReceber.count({ where: { clienteId: id, status: 'PENDENTE' } });
  if (pendentes > 0) throw conflito(`Este cliente tem fiado em aberto e não pode ser ${acao}. Receba ou cancele as parcelas antes.`);
}

/** Excluir = inativar: o histórico de OS e de caixa continua apontando para ele. */
export async function inativar(id: string) {
  await conferirSemFiado(id, 'excluído');
  await prisma.cliente.update({ where: { id }, data: { ativo: false } });
}

/**
 * LGPD — o cliente pediu para ter os dados apagados. Os dados pessoais saem;
 * o histórico financeiro fica (a oficina precisa dele), mas sem nome nem contato.
 */
export async function anonimizar(id: string) {
  await conferirSemFiado(id, 'anonimizado');
  const c = await prisma.cliente.findUnique({ where: { id }, select: { id: true, orcamentos: { select: { id: true } } } });
  if (!c) throw naoEncontrado('Cliente não encontrado');

  await prisma.$transaction([
    // O histórico continua dizendo QUEM fez O QUÊ e QUANDO com este cadastro,
    // mas sem o conteúdo enviado (nome, e-mail, contato do orçamento rápido).
    prisma.logAuditoria.updateMany({
      where: {
        OR: [
          { entidade: 'clientes', entidadeId: id },
          { entidade: 'orcamentos', entidadeId: { in: c.orcamentos.map((o) => o.id) } },
        ],
      },
      data: { detalhes: null },
    }),
    prisma.cliente.update({
      where: { id },
      data: {
        nome: `Cliente anonimizado ${id.slice(-6).toUpperCase()}`,
        cpfCnpj: null,
        telefone: null,
        whatsapp: null,
        email: null,
        endereco: null,
        observacoes: null,
        ativo: false,
      },
    }),
    prisma.carro.updateMany({ where: { clienteId: id }, data: { ativo: false, observacoes: null, chassi: null } }),
    prisma.orcamento.updateMany({ where: { clienteId: id }, data: { contatoNome: null, contatoTelefone: null } }),
  ]);
}
