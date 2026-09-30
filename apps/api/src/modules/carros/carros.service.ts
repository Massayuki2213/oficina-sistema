import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { CarroDTO, FichaVeiculoDTO, HistoricoOSDTO, Pagina, UsuarioSessao } from '@hermes/shared';
import { normalizarPlaca } from '@hermes/shared';
import type { carroSchema, listarCarrosQuery } from '@hermes/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { invalido, naoEncontrado } from '../../lib/errors.js';
import { falhaDeVersao, naVersao, proximaVersao } from '../../lib/versao.js';
import { num } from '../../lib/dinheiro.js';
import { isoOuNull } from '../../lib/datas.js';
import { pagina, paginar, termoCompacto } from '../../lib/paginacao.js';
import { situacaoFiado } from '../../dominio/fiado.js';
import { paraVeiculoResumo } from '../clientes/clientes.service.js';

type DadosCarro = z.output<typeof carroSchema>;

const incluirDono = { cliente: { select: { id: true, nome: true, telefone: true, whatsapp: true } } } as const;
type CarroComDono = Prisma.CarroGetPayload<{ include: typeof incluirDono }>;

function paraDTO(c: CarroComDono, ator?: UsuarioSessao): CarroDTO {
  // O mecânico vê de quem é o carro, mas não o contato (LGPD: só quem atende precisa).
  const veContato = !ator || ator.permissoes.cadastrarClientes;
  return {
    ...paraVeiculoResumo(c),
    versao: c.versao,
    clienteId: c.clienteId,
    chassi: c.chassi,
    observacoes: c.observacoes,
    ativo: c.ativo,
    cliente: {
      id: c.cliente.id,
      nome: c.cliente.nome,
      telefone: veContato ? c.cliente.telefone : null,
      whatsapp: veContato ? c.cliente.whatsapp : null,
    },
  };
}

export async function listar(q: z.output<typeof listarCarrosQuery>): Promise<Pagina<CarroDTO>> {
  const compacto = q.busca ? termoCompacto(q.busca) : '';
  const where: Prisma.CarroWhereInput = {
    ativo: true,
    ...(q.clienteId ? { clienteId: q.clienteId } : {}),
    ...(q.busca
      ? {
          OR: [
            ...(compacto ? [{ placa: { contains: compacto } }] : []),
            { marca: { contains: q.busca, mode: 'insensitive' } },
            { modelo: { contains: q.busca, mode: 'insensitive' } },
            { cliente: { nome: { contains: q.busca, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [itens, total] = await prisma.$transaction([
    prisma.carro.findMany({ where, orderBy: { placa: 'asc' }, include: incluirDono, ...paginar(q) }),
    prisma.carro.count({ where }),
  ]);
  return pagina(
    itens.map((c) => paraDTO(c)),
    total,
    q,
  );
}

/**
 * RN-16/17 — a consulta que abre o atendimento no balcão.
 *
 * Digitou a placa, aparece tudo que o atendente precisa saber antes de falar
 * com o cliente: o veículo, o dono, se ele está devendo e o que já foi feito
 * no carro. Vem num pacote só — uma ida ao servidor.
 */
async function montarFicha(where: Prisma.CarroWhereUniqueInput, ator: UsuarioSessao): Promise<FichaVeiculoDTO | null> {
  const carro = await prisma.carro.findUnique({
    where,
    include: {
      ...incluirDono,
      ordens: {
        orderBy: { dataAbertura: 'desc' },
        take: 20,
        include: {
          mecanico: { select: { nome: true } },
          servicos: { include: { servico: { select: { nome: true } } } },
        },
      },
    },
  });
  if (!carro) return null;

  const historico: HistoricoOSDTO[] = carro.ordens.map((o) => ({
    id: o.id,
    numero: o.numero,
    dataAbertura: o.dataAbertura.toISOString(),
    dataConclusao: isoOuNull(o.dataConclusao),
    status: o.status,
    total: num(o.total),
    pago: o.pago,
    garantia: o.garantia,
    kmEntrada: o.kmEntrada,
    mecanico: o.mecanico?.nome ?? null,
    // O que foi feito, em uma linha — é o que responde "já mexemos nisso?".
    servicos: o.servicos.map((s) => s.servico.nome),
  }));

  return {
    ...paraDTO(carro, ator),
    historico,
    // Situação do fiado só para quem pode cobrar.
    fiado: ator.permissoes.receberPagamentos ? await situacaoFiado(prisma, carro.clienteId) : null,
  };
}

export async function fichaPorPlaca(placa: string, ator: UsuarioSessao) {
  const ficha = await montarFicha({ placa: normalizarPlaca(placa) }, ator);
  if (!ficha) throw naoEncontrado('Veículo não encontrado');
  return ficha;
}

export async function ficha(id: string, ator: UsuarioSessao) {
  const f = await montarFicha({ id }, ator);
  if (!f) throw naoEncontrado('Veículo não encontrado');
  return f;
}

async function conferirCliente(clienteId: string) {
  const c = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { ativo: true } });
  if (!c || !c.ativo) throw invalido('Cliente informado não existe');
}

/**
 * Cadastro. Se a placa pertence a um veículo que foi excluído, ele volta à
 * ativa com os dados novos (o carro foi vendido e voltou com outro dono, por
 * exemplo) — o histórico dele continua junto.
 */
export async function criar(dados: DadosCarro): Promise<CarroDTO> {
  await conferirCliente(dados.clienteId);
  const existente = await prisma.carro.findUnique({ where: { placa: dados.placa }, select: { id: true, ativo: true } });
  if (existente && !existente.ativo) {
    const c = await prisma.carro.update({ where: { id: existente.id }, data: { ...dados, ativo: true }, include: incluirDono });
    return paraDTO(c);
  }
  const c = await prisma.carro.create({ data: dados, include: incluirDono });
  return paraDTO(c);
}

export async function atualizar(id: string, { versao, ...dados }: DadosCarro): Promise<CarroDTO> {
  await conferirCliente(dados.clienteId);
  const r = await prisma.carro.updateMany({ where: { id, ...naVersao(versao) }, data: { ...dados, ...proximaVersao } });
  if (r.count === 0) await falhaDeVersao('carros', id, (await prisma.carro.count({ where: { id } })) > 0, 'Veículo não encontrado');
  return paraDTO(await prisma.carro.findUniqueOrThrow({ where: { id }, include: incluirDono }));
}

/** Excluir = inativar: as OS antigas continuam apontando para o veículo. */
export async function inativar(id: string) {
  await prisma.carro.update({ where: { id }, data: { ativo: false } });
}
