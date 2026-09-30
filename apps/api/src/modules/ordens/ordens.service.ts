import type { Prisma, StatusOS } from '@prisma/client';
import type { z } from 'zod';
import {
  LABEL_FORMA_PAGAMENTO,
  STATUS_DO_MECANICO,
  STATUS_OS_ABERTOS,
  TRANSICOES_OS,
  type FormaPagamento,
  type OrdemServicoDTO,
  type OSResumoDTO,
  type Pagina,
  type SituacaoGarantiaDTO,
  type UsuarioSessao,
} from '@hermes/shared';
import type {
  abrirGarantiaSchema,
  adicionarPecaOSSchema,
  adicionarServicoOSSchema,
  alterarPecaOSSchema,
  alterarServicoOSSchema,
  atualizarOSSchema,
  criarOSSchema,
  listarOSQuery,
  mudarStatusOSSchema,
  receberOSSchema,
} from '@hermes/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { COD, conflito, invalido, naoEncontrado, semPermissao } from '../../lib/errors.js';
import { falhaDeVersao, naVersao, proximaVersao } from '../../lib/versao.js';
import { brl, multiplicar, num, somar, somarQtd, subtrair } from '../../lib/dinheiro.js';
import { adicionarDias, diasEntre, hojeISO, isoOuNull } from '../../lib/datas.js';
import { pagina, paginar, termoCompacto } from '../../lib/paginacao.js';
import { conferirTetoDeDesconto, fecharTotal, precificar } from '../../dominio/precificacao.js';
import { darSaida, devolver, verificarFaltas } from '../../dominio/estoque.js';
import { lancar } from '../../dominio/caixa.js';
import { gerarParcelas, situacaoFiado } from '../../dominio/fiado.js';
import { getOficina } from '../oficina/oficina.service.js';
import { incluirParcela, paraParcela } from '../contas/contas.mapper.js';
import { incluirItens, incluirOSResumo, paraItemPeca, paraItemServico, paraOSResumo } from './ordens.mapper.js';

// ============================================================
// Ordem de Serviço — o coração da oficina.
//
// Regras que moram aqui:
//  - RN-10: não conclui sem ao menos 1 serviço ou peça;
//  - a OS pode ser corrigida enquanto o pagamento não foi registrado:
//    peça lançada baixa estoque, peça retirada volta (RN-01);
//  - RN-11/11.1: receber = dinheiro no caixa e/ou parcelas a prazo,
//    fechando exatamente com o total;
//  - cancelar devolve as peças ao estoque; estornar desfaz o pagamento
//    sem apagar nada do caixa;
//  - o mecânico vê as OS dele (e as sem mecânico, para assumir) e só
//    mexe nas dele: status, apontamento de serviço e peças usadas.
// ============================================================

type Tx = Prisma.TransactionClient;

// ---- Formato de resposta ---------------------------------------------------

const incluirCompleto = {
  cliente: { select: { id: true, nome: true, telefone: true, whatsapp: true, cpfCnpj: true } },
  carro: { select: { id: true, placa: true, marca: true, modelo: true, ano: true, cor: true, kmAtual: true } },
  mecanico: { select: { id: true, nome: true } },
  orcamento: { select: { id: true, numero: true } },
  osOrigem: { select: { id: true, numero: true } },
  garantias: { select: { id: true, numero: true } },
  lancamentos: { orderBy: { data: 'asc' } },
  contasReceber: { orderBy: { parcela: 'asc' }, include: incluirParcela },
  ...incluirItens,
} satisfies Prisma.OrdemServicoInclude;

type OSCompleta = Prisma.OrdemServicoGetPayload<{ include: typeof incluirCompleto }>;

function paraDTO(o: OSCompleta, ator: UsuarioSessao): OrdemServicoDTO {
  const financeiro = ator.permissoes.receberPagamentos;
  const contato = ator.permissoes.cadastrarClientes;

  const entradas = o.lancamentos.filter((l) => l.tipo === 'ENTRADA');
  const estornos = o.lancamentos.filter((l) => l.tipo === 'SAIDA' && l.origem === 'ESTORNO');
  const parcelas = o.contasReceber.map((p) => paraParcela(p));

  return {
    ...paraOSResumo(o),
    versao: o.versao,
    cliente: {
      id: o.cliente.id,
      nome: o.cliente.nome,
      telefone: contato ? o.cliente.telefone : null,
      whatsapp: contato ? o.cliente.whatsapp : null,
      cpfCnpj: contato ? o.cliente.cpfCnpj : null,
    },
    carro: o.carro,
    orcamento: o.orcamento,
    osOrigem: o.osOrigem,
    garantias: o.garantias,
    kmEntrada: o.kmEntrada,
    defeitoRelatado: o.defeitoRelatado,
    observacoes: o.observacoes,
    dataEntrega: isoOuNull(o.dataEntrega),
    canceladaEm: isoOuNull(o.canceladaEm),
    motivoCancelamento: o.motivoCancelamento,
    subtotal: num(o.subtotal),
    desconto: num(o.desconto),
    servicos: o.servicos.map(paraItemServico),
    pecas: o.pecas.map(paraItemPeca),
    recebido: subtrair(somar(...entradas.map((l) => num(l.valor))), somar(...estornos.map((l) => num(l.valor)))),
    aReceber: somar(...parcelas.filter((p) => p.status === 'PENDENTE').map((p) => p.saldo)),
    pagamentos: financeiro
      ? o.lancamentos.map((l) => ({
          id: l.id,
          data: l.data.toISOString(),
          tipo: l.tipo,
          forma: l.formaPagamento,
          valor: num(l.valor),
          descricao: l.descricao,
        }))
      : [],
    parcelas: financeiro ? parcelas : [],
  };
}

// ---- Acesso ----------------------------------------------------------------

/** Sem "ver todas": só as atribuídas a si e as sem mecânico (para assumir). */
function filtroDeAcesso(ator: UsuarioSessao): Prisma.OrdemServicoWhereInput {
  if (ator.permissoes.verTodasOS) return {};
  return {
    OR: [{ mecanicoId: ator.id }, { mecanicoId: null, status: { in: [...STATUS_OS_ABERTOS] } }],
  };
}

function conferirAcesso(os: { mecanicoId: string | null }, ator: UsuarioSessao) {
  if (ator.permissoes.verTodasOS) return;
  if (os.mecanicoId !== null && os.mecanicoId !== ator.id) throw semPermissao('Esta OS está com outro mecânico.');
}

// ---- Validações compartilhadas com o orçamento -----------------------------

/** O veículo precisa existir e ser daquele cliente. */
export async function validarVeiculoDoCliente(clienteId: string, carroId: string) {
  const carro = await prisma.carro.findUnique({ where: { id: carroId }, select: { clienteId: true } });
  if (!carro) throw invalido('Veículo não encontrado');
  if (carro.clienteId !== clienteId) throw invalido('O veículo não pertence a esse cliente');
}

export async function validarMecanico(mecanicoId: string) {
  const mec = await prisma.usuario.findUnique({ where: { id: mecanicoId }, select: { perfil: true, ativo: true } });
  if (!mec || !mec.ativo) throw invalido('Mecânico não encontrado');
  if (mec.perfil !== 'MECANICO') throw invalido('Esse usuário não é um mecânico');
}

/** KM de entrada atualiza o KM do veículo — só para frente (odômetro não volta). */
async function atualizarKm(tx: Tx, carroId: string, km: number | null | undefined) {
  if (km == null) return;
  await tx.carro.updateMany({ where: { id: carroId, OR: [{ kmAtual: null }, { kmAtual: { lt: km } }] }, data: { kmAtual: km } });
}

// ---- Abertura (orçamento aprovado ou OS direta) -----------------------------

export interface AberturaOS {
  orcamentoId?: string | null;
  clienteId: string;
  carroId: string;
  mecanicoId?: string | null;
  kmEntrada?: number | null;
  defeitoRelatado?: string | null;
  dataPrevista?: Date | null;
  subtotal: number;
  desconto: number;
  total: number;
  servicos: { servicoId: string; quantidade: number; precoUnit: number }[];
  pecas: { pecaId: string; quantidade: number; precoUnit: number }[];
  aguardandoPeca: boolean;
  usuarioId: string;
}

/** Cria a OS, lança os serviços, baixa as peças (RN-01) e anota o KM. */
export async function abrirOS(tx: Tx, a: AberturaOS) {
  const os = await tx.ordemServico.create({
    data: {
      orcamentoId: a.orcamentoId ?? null,
      clienteId: a.clienteId,
      carroId: a.carroId,
      mecanicoId: a.mecanicoId ?? null,
      status: a.aguardandoPeca ? 'AGUARDANDO_PECA' : 'ABERTA',
      kmEntrada: a.kmEntrada ?? null,
      defeitoRelatado: a.defeitoRelatado ?? null,
      dataPrevista: a.dataPrevista ?? null,
      subtotal: a.subtotal,
      desconto: a.desconto,
      total: a.total,
      // Sem valor a cobrar (OS só de diagnóstico, ainda vazia): nada a receber.
      pago: a.total === 0,
      servicos: { create: a.servicos },
    },
  });

  for (const p of a.pecas) {
    const { custo } = await darSaida(tx, p.pecaId, p.quantidade, { motivo: `OS #${os.numero}`, osId: os.id, usuarioId: a.usuarioId });
    await tx.oSPeca.create({
      data: { osId: os.id, pecaId: p.pecaId, quantidade: p.quantidade, precoUnit: p.precoUnit, custoUnit: custo },
    });
  }

  await atualizarKm(tx, a.carroId, a.kmEntrada);
  return os;
}

// ---- Consulta --------------------------------------------------------------

export async function listar(q: z.output<typeof listarOSQuery>, ator: UsuarioSessao): Promise<Pagina<OSResumoDTO>> {
  const busca = q.busca;
  const where: Prisma.OrdemServicoWhereInput = {
    AND: [
      filtroDeAcesso(ator),
      q.status ? { status: q.status } : {},
      // "Abertas" = o carro ainda está na oficina (inclui a concluída esperando retirada).
      q.abertas ? { status: { in: [...STATUS_OS_ABERTOS] } } : {},
      q.mecanicoId ? { mecanicoId: q.mecanicoId } : {},
      q.clienteId ? { clienteId: q.clienteId } : {},
      q.carroId ? { carroId: q.carroId } : {},
      busca
        ? {
            OR: [
              { cliente: { nome: { contains: busca, mode: 'insensitive' } } },
              { carro: { placa: { contains: termoCompacto(busca) } } },
              { carro: { modelo: { contains: busca, mode: 'insensitive' } } },
              ...(/^\d{1,7}$/.test(busca) ? [{ numero: Number(busca) }] : []),
            ],
          }
        : {},
    ],
  };

  const [itens, total] = await prisma.$transaction([
    prisma.ordemServico.findMany({ where, orderBy: { dataAbertura: 'desc' }, include: incluirOSResumo, ...paginar(q) }),
    prisma.ordemServico.count({ where }),
  ]);
  return pagina(itens.map(paraOSResumo), total, q);
}

export async function buscar(id: string, ator: UsuarioSessao): Promise<OrdemServicoDTO> {
  const os = await prisma.ordemServico.findUnique({ where: { id }, include: incluirCompleto });
  if (!os) throw naoEncontrado('Ordem de Serviço não encontrada');
  conferirAcesso(os, ator);
  return paraDTO(os, ator);
}

// ---- OS direta -------------------------------------------------------------

/** OS sem orçamento — ex.: troca de óleo com o cliente esperando no balcão. */
export async function criar(dados: z.output<typeof criarOSSchema>, ator: UsuarioSessao) {
  await validarVeiculoDoCliente(dados.clienteId, dados.carroId);
  if (dados.mecanicoId) await validarMecanico(dados.mecanicoId);

  const precos = await precificar(prisma, dados, ator);
  const totais = await fecharTotal(precos, dados.desconto, ator, dados.senhaDono);

  const faltas = await verificarFaltas(prisma, precos.pecas);
  if (faltas.length > 0 && !dados.confirmarSemEstoque) {
    throw conflito(
      `Falta peça no estoque: ${faltas.map((f) => f.nome).join(', ')}. Confirme para encomendar.`,
      COD.ESTOQUE_INSUFICIENTE,
      faltas,
    );
  }

  const os = await prisma.$transaction((tx) =>
    abrirOS(tx, {
      clienteId: dados.clienteId,
      carroId: dados.carroId,
      mecanicoId: dados.mecanicoId ?? null,
      kmEntrada: dados.kmEntrada ?? null,
      defeitoRelatado: dados.defeitoRelatado ?? null,
      dataPrevista: dados.dataPrevista ? new Date(dados.dataPrevista) : null,
      ...totais,
      servicos: precos.servicos.map((s) => ({ servicoId: s.servicoId, quantidade: s.quantidade, precoUnit: s.precoUnit })),
      pecas: precos.pecas.map((p) => ({ pecaId: p.pecaId, quantidade: p.quantidade, precoUnit: p.precoUnit })),
      aguardandoPeca: faltas.length > 0,
      usuarioId: ator.id,
    }),
  );
  return buscar(os.id, ator);
}

// ---- Edição ----------------------------------------------------------------

const ENCERRADAS: StatusOS[] = ['ENTREGUE', 'CANCELADA'];

/**
 * Carrega a OS para mudar itens/valores. Trava a linha (duas pessoas
 * editando a mesma OS não se atropelam no total) e confere se ainda dá.
 */
async function carregarEditavel(tx: Tx, id: string, ator: UsuarioSessao, oque: 'servico' | 'peca' | 'dados') {
  await tx.$executeRaw`SELECT id FROM ordens_servico WHERE id = ${id} FOR UPDATE`;
  const os = await tx.ordemServico.findUnique({ where: { id } });
  if (!os) throw naoEncontrado('Ordem de Serviço não encontrada');
  if (ENCERRADAS.includes(os.status)) throw conflito('OS entregue ou cancelada não pode ser alterada');
  if (os.formaPagamento) {
    throw conflito('O pagamento desta OS já foi registrado. Estorne o pagamento para alterar a OS.');
  }
  if (!ator.permissoes.atender) {
    // Mecânico: só na OS dele, e só lança/retira peça (serviço e valores são do balcão).
    if (os.mecanicoId !== ator.id) throw semPermissao('Esta OS não está com você.');
    if (oque !== 'peca') throw semPermissao();
  }
  return os;
}

/**
 * RN-09 — refaz subtotal, desconto e total a partir dos itens.
 * O teto de desconto (RN-08) é conferido quando a mudança é uma decisão de
 * preço (desconto ou preço de item); tirar um item não pede senha a ninguém.
 */
async function recalcular(
  tx: Tx,
  os: { id: string; desconto: Prisma.Decimal; garantia: boolean },
  opcoes: { ator: UsuarioSessao; conferirTeto?: boolean; senhaDono?: string; desconto?: number },
) {
  const [servicos, pecas] = await Promise.all([
    tx.oSServico.findMany({ where: { osId: os.id }, include: { servico: { select: { precoMaoDeObra: true } } } }),
    tx.oSPeca.findMany({ where: { osId: os.id }, include: { peca: { select: { precoVenda: true } } } }),
  ]);

  const subtotal = somar(
    ...servicos.map((s) => multiplicar(num(s.precoUnit), s.quantidade)),
    ...pecas.map((p) => multiplicar(num(p.precoUnit), num(p.quantidade))),
  );
  const subtotalCatalogo = somar(
    ...servicos.map((s) => multiplicar(num(s.servico.precoMaoDeObra), s.quantidade)),
    ...pecas.map((p) => multiplicar(num(p.peca.precoVenda), num(p.quantidade))),
  );
  const desconto = Math.min(opcoes.desconto ?? num(os.desconto), subtotal);
  const total = subtrair(subtotal, desconto);

  // Garantia é sem cobrança por definição: o "desconto" dela não passa pelo teto.
  if (opcoes.conferirTeto && !os.garantia) {
    await conferirTetoDeDesconto(subtotalCatalogo, total, opcoes.ator, opcoes.senhaDono);
  }
  // Antes do recebimento, "pago" quer dizer "não há nada a receber".
  await tx.ordemServico.update({ where: { id: os.id }, data: { subtotal, desconto, total, pago: total === 0 } });
}

/** Dados gerais: KM, queixa, laudo, previsão e desconto. O mecânico só escreve o laudo. */
export async function atualizar(id: string, dados: z.output<typeof atualizarOSSchema>, ator: UsuarioSessao) {
  if (!ator.permissoes.atender) {
    const soLaudo = Object.entries(dados).every(([k, v]) => k === 'observacoes' || k === 'versao' || v === undefined);
    if (!soLaudo) throw semPermissao('O mecânico altera só o laudo da OS.');
    const os = await prisma.ordemServico.findUnique({ where: { id }, select: { mecanicoId: true, status: true } });
    if (!os) throw naoEncontrado('Ordem de Serviço não encontrada');
    if (os.mecanicoId !== ator.id) throw semPermissao('Esta OS não está com você.');
    if (os.status === 'CANCELADA') throw conflito('OS cancelada não pode ser alterada');
    const r = await prisma.ordemServico.updateMany({
      where: { id, ...naVersao(dados.versao) },
      data: { observacoes: dados.observacoes, ...proximaVersao },
    });
    if (r.count === 0) await falhaDeVersao('ordens', id, true, 'Ordem de Serviço não encontrada');
    return buscar(id, ator);
  }

  if (dados.desconto !== undefined && dados.desconto > 0 && !ator.permissoes.darDesconto) {
    throw semPermissao('Seu perfil não pode dar desconto.');
  }

  await prisma.$transaction(async (tx) => {
    // Laudo e previsão podem ser anotados até na OS paga; valores, não.
    const soTexto = dados.desconto === undefined && dados.kmEntrada === undefined;
    const os = soTexto
      ? await tx.ordemServico.findUniqueOrThrow({ where: { id } })
      : await carregarEditavel(tx, id, ator, 'dados');
    if (os.status === 'CANCELADA') throw conflito('OS cancelada não pode ser alterada');

    // Compare-and-set (ADR 0010): se alguém salvou os dados da OS no meio, nada é gravado.
    const r = await tx.ordemServico.updateMany({
      where: { id, ...naVersao(dados.versao) },
      data: {
        ...(dados.kmEntrada !== undefined ? { kmEntrada: dados.kmEntrada } : {}),
        ...(dados.defeitoRelatado !== undefined ? { defeitoRelatado: dados.defeitoRelatado } : {}),
        ...(dados.observacoes !== undefined ? { observacoes: dados.observacoes } : {}),
        ...(dados.dataPrevista !== undefined ? { dataPrevista: dados.dataPrevista ? new Date(dados.dataPrevista) : null } : {}),
        ...proximaVersao,
      },
    });
    if (r.count === 0) await falhaDeVersao('ordens', id, true, 'Ordem de Serviço não encontrada');
    await atualizarKm(tx, os.carroId, dados.kmEntrada);
    if (dados.desconto !== undefined) {
      await recalcular(tx, os, { ator, conferirTeto: true, senhaDono: dados.senhaDono, desconto: dados.desconto });
    }
  });
  return buscar(id, ator);
}

/** Preço diferente da tabela é decisão de desconto (RN-05/RN-08). */
function conferirPrecoInformado(precoInformado: number | undefined, precoCatalogo: number, ator: UsuarioSessao) {
  if (precoInformado !== undefined && precoInformado !== precoCatalogo && !ator.permissoes.darDesconto) {
    throw semPermissao('Seu perfil não pode alterar o preço dos itens.');
  }
}

export async function adicionarServico(id: string, dados: z.output<typeof adicionarServicoOSSchema>, ator: UsuarioSessao) {
  await prisma.$transaction(async (tx) => {
    const os = await carregarEditavel(tx, id, ator, 'servico');
    const repetido = await tx.oSServico.findFirst({ where: { osId: id, servicoId: dados.servicoId } });
    if (repetido) throw conflito('Este serviço já está na OS — altere a quantidade na linha dele');

    const { servicos } = await precificar(tx, { servicos: [dados], pecas: [] }, ator);
    const s = servicos[0];
    // Garantia refaz o serviço sem cobrar: sem preço informado, entra a zero.
    const precoUnit = dados.precoUnit ?? (os.garantia ? 0 : s.precoUnit);
    await tx.oSServico.create({ data: { osId: id, servicoId: s.servicoId, quantidade: s.quantidade, precoUnit } });
    await recalcular(tx, os, { ator, conferirTeto: dados.precoUnit !== undefined, senhaDono: dados.senhaDono });
  });
  return buscar(id, ator);
}

export async function alterarServico(
  id: string,
  itemId: string,
  dados: z.output<typeof alterarServicoOSSchema>,
  ator: UsuarioSessao,
) {
  const mexeEmValor = dados.quantidade !== undefined || dados.precoUnit !== undefined;

  await prisma.$transaction(async (tx) => {
    const item = await tx.oSServico.findFirst({ where: { id: itemId, osId: id }, include: { servico: true } });
    if (!item) throw naoEncontrado('Serviço não encontrado nesta OS');

    if (mexeEmValor) {
      const os = await carregarEditavel(tx, id, ator, 'servico');
      conferirPrecoInformado(dados.precoUnit, num(item.servico.precoMaoDeObra), ator);
      await tx.oSServico.update({
        where: { id: itemId },
        data: {
          ...(dados.quantidade !== undefined ? { quantidade: dados.quantidade } : {}),
          ...(dados.precoUnit !== undefined ? { precoUnit: dados.precoUnit } : {}),
        },
      });
      await recalcular(tx, os, { ator, conferirTeto: dados.precoUnit !== undefined, senhaDono: dados.senhaDono });
    }

    // Apontamento: "este serviço está feito". O mecânico faz na OS dele.
    if (dados.concluido !== undefined) {
      const os = await tx.ordemServico.findUniqueOrThrow({ where: { id } });
      if (os.status === 'CANCELADA') throw conflito('OS cancelada não pode ser alterada');
      if (!ator.permissoes.atender && os.mecanicoId !== ator.id) throw semPermissao('Esta OS não está com você.');
      await tx.oSServico.update({ where: { id: itemId }, data: { concluido: dados.concluido } });
    }
  });
  return buscar(id, ator);
}

export async function removerServico(id: string, itemId: string, ator: UsuarioSessao) {
  await prisma.$transaction(async (tx) => {
    const os = await carregarEditavel(tx, id, ator, 'servico');
    const item = await tx.oSServico.findFirst({ where: { id: itemId, osId: id } });
    if (!item) throw naoEncontrado('Serviço não encontrado nesta OS');
    await tx.oSServico.delete({ where: { id: itemId } });
    await recalcular(tx, os, { ator });
  });
  return buscar(id, ator);
}

/** A OS que estava andando e ficou sem a peça passa a "aguardando peça" (RN-03). */
async function marcarAguardandoPeca(tx: Tx, os: { id: string; status: StatusOS }) {
  if (os.status === 'ABERTA' || os.status === 'EM_EXECUCAO') {
    await tx.ordemServico.update({ where: { id: os.id }, data: { status: 'AGUARDANDO_PECA' } });
  }
}

function faltaDeEstoque(faltas: Awaited<ReturnType<typeof verificarFaltas>>) {
  const f = faltas[0];
  return conflito(
    `Só há ${f.disponivel} ${f.unidade} de "${f.nome}" no estoque. Confirme para lançar mesmo assim (encomenda) — a OS fica aguardando peça.`,
    COD.ESTOQUE_INSUFICIENTE,
    faltas,
  );
}

export async function adicionarPeca(id: string, dados: z.output<typeof adicionarPecaOSSchema>, ator: UsuarioSessao) {
  await prisma.$transaction(async (tx) => {
    const os = await carregarEditavel(tx, id, ator, 'peca');
    const repetida = await tx.oSPeca.findFirst({ where: { osId: id, pecaId: dados.pecaId } });
    if (repetida) throw conflito('Esta peça já está na OS — altere a quantidade na linha dela');

    const { pecas } = await precificar(tx, { servicos: [], pecas: [dados] }, ator);
    const p = pecas[0];

    const faltas = await verificarFaltas(tx, [p]);
    if (faltas.length > 0 && !dados.confirmarSemEstoque) throw faltaDeEstoque(faltas);

    const { custo } = await darSaida(tx, p.pecaId, p.quantidade, { motivo: `OS #${os.numero}`, osId: id, usuarioId: ator.id });
    await tx.oSPeca.create({
      data: { osId: id, pecaId: p.pecaId, quantidade: p.quantidade, precoUnit: p.precoUnit, custoUnit: custo },
    });
    if (faltas.length > 0) await marcarAguardandoPeca(tx, os);
    await recalcular(tx, os, { ator, conferirTeto: dados.precoUnit !== undefined, senhaDono: dados.senhaDono });
  });
  return buscar(id, ator);
}

export async function alterarPeca(id: string, itemId: string, dados: z.output<typeof alterarPecaOSSchema>, ator: UsuarioSessao) {
  await prisma.$transaction(async (tx) => {
    const os = await carregarEditavel(tx, id, ator, 'peca');
    const item = await tx.oSPeca.findFirst({ where: { id: itemId, osId: id }, include: { peca: true } });
    if (!item) throw naoEncontrado('Peça não encontrada nesta OS');
    conferirPrecoInformado(dados.precoUnit, num(item.peca.precoVenda), ator);

    // Mudou a quantidade: só a diferença mexe no estoque.
    if (dados.quantidade !== undefined) {
      const diferenca = somarQtd(dados.quantidade, -num(item.quantidade));
      if (diferenca > 0) {
        const faltas = await verificarFaltas(tx, [{ pecaId: item.pecaId, quantidade: diferenca }]);
        if (faltas.length > 0 && !dados.confirmarSemEstoque) throw faltaDeEstoque(faltas);
        await darSaida(tx, item.pecaId, diferenca, { motivo: `OS #${os.numero}`, osId: id, usuarioId: ator.id });
        if (faltas.length > 0) await marcarAguardandoPeca(tx, os);
      } else if (diferenca < 0) {
        await devolver(tx, item.pecaId, -diferenca, { motivo: `Devolução — OS #${os.numero}`, osId: id, usuarioId: ator.id });
      }
    }

    await tx.oSPeca.update({
      where: { id: itemId },
      data: {
        ...(dados.quantidade !== undefined ? { quantidade: dados.quantidade } : {}),
        ...(dados.precoUnit !== undefined ? { precoUnit: dados.precoUnit } : {}),
      },
    });
    await recalcular(tx, os, { ator, conferirTeto: dados.precoUnit !== undefined, senhaDono: dados.senhaDono });
  });
  return buscar(id, ator);
}

export async function removerPeca(id: string, itemId: string, ator: UsuarioSessao) {
  await prisma.$transaction(async (tx) => {
    const os = await carregarEditavel(tx, id, ator, 'peca');
    const item = await tx.oSPeca.findFirst({ where: { id: itemId, osId: id } });
    if (!item) throw naoEncontrado('Peça não encontrada nesta OS');
    await devolver(tx, item.pecaId, num(item.quantidade), { motivo: `Devolução — OS #${os.numero}`, osId: id, usuarioId: ator.id });
    await tx.oSPeca.delete({ where: { id: itemId } });
    await recalcular(tx, os, { ator });
  });
  return buscar(id, ator);
}

// ---- Fluxo (status) --------------------------------------------------------

export async function mudarStatus(id: string, novo: z.output<typeof mudarStatusOSSchema>['status'], ator: UsuarioSessao) {
  const os = await prisma.ordemServico.findUnique({
    where: { id },
    include: { _count: { select: { servicos: true, pecas: true } } },
  });
  if (!os) throw naoEncontrado('Ordem de Serviço não encontrada');
  if (os.status === novo) return buscar(id, ator);

  if (!ator.permissoes.atender) {
    if (os.mecanicoId !== ator.id) throw semPermissao('Esta OS não está com você.');
    if (!STATUS_DO_MECANICO.includes(novo)) throw semPermissao('A entrega do carro é feita pelo balcão.');
  }
  if (!TRANSICOES_OS[os.status].includes(novo)) {
    throw invalido(`Não é possível mudar de "${os.status}" para "${novo}"`);
  }
  // RN-10: não conclui sem pelo menos 1 serviço ou peça.
  if (novo === 'CONCLUIDA' && os._count.servicos + os._count.pecas === 0) {
    throw invalido('A OS precisa de ao menos 1 serviço ou peça para ser concluída');
  }
  // Reabrir uma OS paga bagunçaria o caixa: estorne antes.
  if (os.status === 'CONCLUIDA' && novo === 'EM_EXECUCAO' && os.formaPagamento) {
    throw conflito('O pagamento desta OS já foi registrado. Estorne o pagamento para reabrir.');
  }
  // O carro não sai sem o dinheiro registrado — à vista, parcelado ou fiado.
  if (novo === 'ENTREGUE' && !os.formaPagamento && num(os.total) > 0) {
    throw conflito('Registre o pagamento antes de entregar o carro (à vista, parcelado ou fiado).');
  }

  await prisma.ordemServico.update({
    where: { id },
    data: {
      status: novo,
      ...(novo === 'CONCLUIDA' ? { dataConclusao: new Date() } : {}),
      ...(os.status === 'CONCLUIDA' && novo === 'EM_EXECUCAO' ? { dataConclusao: null } : {}),
      ...(novo === 'ENTREGUE' ? { dataEntrega: new Date() } : {}),
    },
  });
  return buscar(id, ator);
}

export async function atribuirMecanico(id: string, mecanicoId: string | null, ator: UsuarioSessao) {
  if (mecanicoId) await validarMecanico(mecanicoId);
  const os = await prisma.ordemServico.findUnique({ where: { id }, select: { status: true } });
  if (!os) throw naoEncontrado('Ordem de Serviço não encontrada');
  if (ENCERRADAS.includes(os.status)) throw conflito('OS entregue ou cancelada não muda de mecânico');
  await prisma.ordemServico.update({ where: { id }, data: { mecanicoId } });
  return buscar(id, ator);
}

/** O mecânico pega para si uma OS que ninguém assumiu. */
export async function assumir(id: string, ator: UsuarioSessao) {
  const { count } = await prisma.ordemServico.updateMany({
    where: { id, mecanicoId: null, status: { in: [...STATUS_OS_ABERTOS] } },
    data: { mecanicoId: ator.id },
  });
  if (count === 0) throw conflito('Esta OS já está com alguém ou não está mais aberta');
  return buscar(id, ator);
}

/** Cancela a OS e devolve ao estoque as peças que ela tinha baixado. */
export async function cancelar(id: string, motivo: string, ator: UsuarioSessao) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM ordens_servico WHERE id = ${id} FOR UPDATE`;
    const os = await tx.ordemServico.findUnique({ where: { id }, include: { pecas: true } });
    if (!os) throw naoEncontrado('Ordem de Serviço não encontrada');
    if (os.status === 'CANCELADA') throw conflito('Esta OS já está cancelada');
    if (os.status === 'ENTREGUE') throw conflito('OS entregue não pode ser cancelada');
    if (os.formaPagamento) throw conflito('Estorne o pagamento antes de cancelar a OS');

    for (const p of os.pecas) {
      await devolver(tx, p.pecaId, num(p.quantidade), { motivo: `Cancelamento da OS #${os.numero}`, osId: id, usuarioId: ator.id });
    }
    await tx.ordemServico.update({
      where: { id },
      data: { status: 'CANCELADA', canceladaEm: new Date(), motivoCancelamento: motivo },
    });
  });
  return buscar(id, ator);
}

// ---- Dinheiro --------------------------------------------------------------

/**
 * RN-11 / RN-11.1 — receber. Cada pagamento à vista entra no caixa na hora
 * (um lançamento por forma: dá para conferir dinheiro, PIX e maquininha no
 * fechamento). O restante, se houver, vira parcelas em Contas a Receber.
 */
export async function receber(id: string, dados: z.output<typeof receberOSSchema>, ator: UsuarioSessao) {
  const os = await prisma.ordemServico.findUnique({ where: { id }, include: { cliente: true } });
  if (!os) throw naoEncontrado('Ordem de Serviço não encontrada');
  if (os.status === 'CANCELADA') throw invalido('OS cancelada não recebe pagamento');
  if (os.formaPagamento) throw conflito('O pagamento desta OS já foi registrado');
  if (!['CONCLUIDA', 'ENTREGUE'].includes(os.status)) throw invalido('Conclua a OS antes de receber o pagamento');

  const total = num(os.total);
  if (total <= 0) throw invalido('Esta OS não tem valor a receber — é só marcar como entregue.');

  const aVista = somar(...dados.pagamentos.map((p) => p.valor));
  const restante = subtrair(total, aVista);
  if (restante < 0) throw invalido(`Os pagamentos somam ${brl(aVista)}, mais que o total da OS (${brl(total)}).`);
  if (!dados.prazo && restante > 0) {
    throw invalido(`Faltam ${brl(restante)} — informe outro pagamento ou parcele o restante.`);
  }
  if (dados.prazo && restante === 0) throw invalido('Os pagamentos já cobrem o total — não sobrou nada para parcelar.');
  if (dados.prazo && dados.prazo.primeiroVencimento < hojeISO()) {
    throw invalido('O 1º vencimento não pode ser no passado.');
  }

  // RN-11.2: quem já tem parcela vencida não leva mais fiado sem alguém assumir.
  // Só vale para venda a prazo — pagamento à vista quita e nunca é barrado.
  if (dados.prazo && !dados.liberarFiado) {
    const situacao = await situacaoFiado(prisma, os.clienteId);
    if (situacao.bloqueado) {
      throw conflito(
        `${os.cliente.nome} tem ${situacao.parcelasVencidas} parcela(s) vencida(s), somando ${brl(situacao.vencido)}. ` +
          'Receba à vista ou libere o fiado assumindo o risco.',
        COD.FIADO_BLOQUEADO,
        situacao,
      );
    }
  }

  const formas = new Set(dados.pagamentos.map((p) => p.forma));
  const forma: FormaPagamento = dados.prazo
    ? dados.pagamentos.length > 0
      ? 'MISTO'
      : dados.prazo.forma
    : formas.size === 1
      ? dados.pagamentos[0].forma
      : 'MISTO';

  await prisma.$transaction(async (tx) => {
    // Trava contra clique duplo: o segundo "receber" encontra a forma já gravada.
    const { count } = await tx.ordemServico.updateMany({
      where: { id, formaPagamento: null },
      data: { formaPagamento: forma, pago: !dados.prazo, status: 'ENTREGUE', dataEntrega: os.dataEntrega ?? new Date() },
    });
    if (count === 0) throw conflito('O pagamento desta OS já foi registrado');

    for (const p of dados.pagamentos) {
      await lancar(tx, {
        tipo: 'ENTRADA',
        origem: 'OS',
        descricao: `OS #${os.numero} — ${os.cliente.nome}${dados.pagamentos.length > 1 ? ` (${LABEL_FORMA_PAGAMENTO[p.forma]})` : ''}`,
        valor: p.valor,
        formaPagamento: p.forma,
        categoria: 'Ordem de Serviço',
        osId: id,
        usuarioId: ator.id,
      });
    }
    if (dados.prazo) {
      await gerarParcelas(tx, {
        clienteId: os.clienteId,
        osId: id,
        total: restante,
        parcelas: dados.prazo.parcelas,
        primeiroVencimento: dados.prazo.primeiroVencimento,
      });
    }
  });
  return buscar(id, ator);
}

/**
 * Desfaz o recebimento (lançou errado, cliente desistiu...). Nada é apagado:
 * o dinheiro que tinha entrado sai como ESTORNO, as parcelas são canceladas
 * e a OS volta para "concluída, aguardando pagamento".
 */
export async function estornarPagamento(id: string, motivo: string, ator: UsuarioSessao) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM ordens_servico WHERE id = ${id} FOR UPDATE`;
    const os = await tx.ordemServico.findUnique({ where: { id }, include: { lancamentos: true } });
    if (!os) throw naoEncontrado('Ordem de Serviço não encontrada');
    if (!os.formaPagamento) throw invalido('Esta OS não tem pagamento registrado');

    const entrou = somar(...os.lancamentos.filter((l) => l.tipo === 'ENTRADA').map((l) => num(l.valor)));
    const jaEstornado = somar(
      ...os.lancamentos.filter((l) => l.tipo === 'SAIDA' && l.origem === 'ESTORNO').map((l) => num(l.valor)),
    );
    const liquido = subtrair(entrou, jaEstornado);
    if (liquido > 0) {
      await lancar(tx, {
        tipo: 'SAIDA',
        origem: 'ESTORNO',
        descricao: `Estorno — OS #${os.numero}: ${motivo}`,
        valor: liquido,
        categoria: 'Estorno',
        osId: id,
        usuarioId: ator.id,
      });
    }
    await tx.contaReceber.updateMany({ where: { osId: id, status: { not: 'CANCELADA' } }, data: { status: 'CANCELADA' } });
    await tx.ordemServico.update({
      where: { id },
      data: { formaPagamento: null, pago: num(os.total) === 0, status: 'CONCLUIDA', dataEntrega: null },
    });
  });
  return buscar(id, ator);
}

// ---- Garantia (RN-18) ------------------------------------------------------

async function limiteDaGarantia(os: { dataConclusao: Date | null; dataAbertura: Date }) {
  const { garantiaDias } = await getOficina();
  // O prazo conta da conclusão; se ela faltar, cai para a abertura.
  const referencia = os.dataConclusao ?? os.dataAbertura;
  return { garantiaDias, limite: adicionarDias(referencia, garantiaDias) };
}

/** Situação da garantia de uma OS — alimenta o botão da tela. */
export async function situacaoGarantia(id: string, ator: UsuarioSessao): Promise<SituacaoGarantiaDTO> {
  const os = await prisma.ordemServico.findUnique({
    where: { id },
    select: {
      status: true,
      garantia: true,
      mecanicoId: true,
      dataAbertura: true,
      dataConclusao: true,
      garantias: { select: { id: true, numero: true } },
    },
  });
  if (!os) throw naoEncontrado('Ordem de Serviço não encontrada');
  conferirAcesso(os, ator);

  const { limite } = await limiteDaGarantia(os);
  const concluida = os.status === 'CONCLUIDA' || os.status === 'ENTREGUE';
  return {
    elegivel: concluida && !os.garantia && new Date() <= limite,
    ehGarantia: os.garantia,
    garantiaAte: limite.toISOString(),
    diasRestantes: Math.max(0, diasEntre(limite, new Date())),
    garantiasAbertas: os.garantias,
  };
}

/**
 * RN-18 — o carro voltou dentro do prazo pelo mesmo problema: nova OS que
 * refaz a mão de obra sem cobrar.
 *  - copia só os SERVIÇOS, a preço zero. Peça nova é custo real: entra na OS
 *    de garantia pelo fluxo normal, para o estoque não baixar sem ninguém ver;
 *  - guarda `osOrigemId`, para o histórico do veículo mostrar o retorno.
 */
export async function abrirGarantia(id: string, dados: z.output<typeof abrirGarantiaSchema>, ator: UsuarioSessao) {
  const origem = await prisma.ordemServico.findUnique({ where: { id }, include: { servicos: true } });
  if (!origem) throw naoEncontrado('Ordem de Serviço não encontrada');
  if (origem.garantia) throw invalido('Esta OS já é uma garantia. Abra a garantia pela OS original.');
  if (!['CONCLUIDA', 'ENTREGUE'].includes(origem.status)) {
    throw invalido('Só cabe garantia depois que o serviço foi concluído');
  }
  if (origem.servicos.length === 0) throw invalido('Esta OS não tem serviço de mão de obra para cobrir em garantia');

  const { garantiaDias, limite } = await limiteDaGarantia(origem);
  if (new Date() > limite) {
    throw invalido(
      `A garantia de ${garantiaDias} dias venceu em ${limite.toLocaleDateString('pt-BR')}. Abra uma OS normal para este atendimento.`,
    );
  }
  if (dados.mecanicoId) await validarMecanico(dados.mecanicoId);

  const criada = await prisma.ordemServico.create({
    data: {
      clienteId: origem.clienteId,
      carroId: origem.carroId,
      mecanicoId: dados.mecanicoId ?? origem.mecanicoId,
      osOrigemId: origem.id,
      garantia: true,
      status: 'ABERTA',
      defeitoRelatado: dados.defeitoRelatado ?? `Retorno em garantia da OS #${origem.numero}`,
      subtotal: 0,
      desconto: 0,
      total: 0,
      pago: true,
      servicos: {
        create: origem.servicos.map((s) => ({ servicoId: s.servicoId, quantidade: s.quantidade, precoUnit: 0 })),
      },
    },
  });
  return {
    os: await buscar(criada.id, ator),
    origem: { id: origem.id, numero: origem.numero },
    garantiaAte: limite.toISOString(),
  };
}
