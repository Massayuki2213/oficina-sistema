import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { AprovacaoDTO, OrcamentoDTO, OrcamentoResumoDTO, Pagina, UsuarioSessao } from '@hermes/shared';
import type {
  aprovarOrcamentoSchema,
  listarOrcamentosQuery,
  orcamentoSchema,
  statusOrcamentoSchema,
} from '@hermes/shared/schemas';
import { prisma } from '../../lib/prisma.js';
import { AppError, COD, conflito, invalido, naoEncontrado } from '../../lib/errors.js';
import { falhaDeVersao, naVersao, proximaVersao } from '../../lib/versao.js';
import { num } from '../../lib/dinheiro.js';
import { adicionarDias, fimDoDia } from '../../lib/datas.js';
import { digitosDaBusca, pagina, paginar, termoCompacto } from '../../lib/paginacao.js';
import { fecharTotal, precificar } from '../../dominio/precificacao.js';
import { verificarFaltas } from '../../dominio/estoque.js';
import { getOficina } from '../oficina/oficina.service.js';
import { incluirItens, incluirOSResumo, paraItemPeca, paraItemServico, paraOSResumo } from '../ordens/ordens.mapper.js';
import { abrirOS, validarMecanico, validarVeiculoDoCliente } from '../ordens/ordens.service.js';

type DadosOrcamento = z.output<typeof orcamentoSchema>;

const incluirResumo = {
  cliente: { select: { id: true, nome: true } },
  carro: { select: { id: true, placa: true, modelo: true } },
  ordem: { select: { id: true, numero: true } },
} satisfies Prisma.OrcamentoInclude;

const incluirCompleto = {
  cliente: { select: { id: true, nome: true, telefone: true, whatsapp: true, cpfCnpj: true } },
  carro: { select: { id: true, placa: true, marca: true, modelo: true, ano: true, kmAtual: true } },
  ordem: { select: { id: true, numero: true } },
  ...incluirItens,
} satisfies Prisma.OrcamentoInclude;

type OrcResumo = Prisma.OrcamentoGetPayload<{ include: typeof incluirResumo }>;
type OrcCompleto = Prisma.OrcamentoGetPayload<{ include: typeof incluirCompleto }>;

function paraResumo(o: OrcResumo): OrcamentoResumoDTO {
  return {
    id: o.id,
    numero: o.numero,
    data: o.data.toISOString(),
    validade: o.validade.toISOString(),
    status: o.status,
    total: num(o.total),
    cliente: o.cliente,
    carro: o.carro,
    contatoNome: o.contatoNome,
    contatoTelefone: o.contatoTelefone,
    veiculoDescricao: o.veiculoDescricao,
    os: o.ordem,
  };
}

function paraDTO(o: OrcCompleto): OrcamentoDTO {
  return {
    id: o.id,
    versao: o.versao,
    numero: o.numero,
    data: o.data.toISOString(),
    validade: o.validade.toISOString(),
    status: o.status,
    total: num(o.total),
    contatoNome: o.contatoNome,
    contatoTelefone: o.contatoTelefone,
    veiculoDescricao: o.veiculoDescricao,
    os: o.ordem,
    clienteId: o.clienteId,
    carroId: o.carroId,
    cliente: o.cliente,
    carro: o.carro,
    subtotal: num(o.subtotal),
    desconto: num(o.desconto),
    observacoes: o.observacoes,
    servicos: o.servicos.map(paraItemServico),
    pecas: o.pecas.map(paraItemPeca),
  };
}

/**
 * RN-06: o orçamento vence sozinho depois da validade.
 *
 * A expiração é aplicada na LEITURA, não por um job de fundo. Job só roda com a
 * API ligada — erraria justamente o dia em que a oficina ficou fechada, que é
 * quando os orçamentos vencem. Assim, quem abre a tela sempre vê o status certo.
 * Só RASCUNHO e ENVIADO expiram: APROVADO já virou OS e RECUSADO já morreu.
 */
export async function expirarVencidos() {
  const { count } = await prisma.orcamento.updateMany({
    where: { status: { in: ['RASCUNHO', 'ENVIADO'] }, validade: { lt: new Date() } },
    data: { status: 'EXPIRADO' },
  });
  return count;
}

export async function listar(q: z.output<typeof listarOrcamentosQuery>): Promise<Pagina<OrcamentoResumoDTO>> {
  await expirarVencidos();

  const busca = q.busca;
  const digitos = busca ? digitosDaBusca(busca) : null;
  const where: Prisma.OrcamentoWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(busca
      ? {
          OR: [
            { cliente: { nome: { contains: busca, mode: 'insensitive' } } },
            { carro: { placa: { contains: termoCompacto(busca) } } },
            // O orçamento rápido não tem cadastro: sem isto ele seria
            // impossível de achar depois que saísse da primeira página.
            { contatoNome: { contains: busca, mode: 'insensitive' } },
            { veiculoDescricao: { contains: busca, mode: 'insensitive' } },
            ...(digitos ? [{ contatoTelefone: { contains: digitos } }] : []),
            ...(/^\d{1,7}$/.test(busca) ? [{ numero: Number(busca) }] : []),
          ],
        }
      : {}),
  };

  const [itens, total] = await prisma.$transaction([
    prisma.orcamento.findMany({ where, orderBy: { data: 'desc' }, include: incluirResumo, ...paginar(q) }),
    prisma.orcamento.count({ where }),
  ]);
  return pagina(itens.map(paraResumo), total, q);
}

export async function buscar(id: string): Promise<OrcamentoDTO> {
  await expirarVencidos();
  const o = await prisma.orcamento.findUnique({ where: { id }, include: incluirCompleto });
  if (!o) throw naoEncontrado('Orçamento não encontrado');
  return paraDTO(o);
}

/**
 * Valida o veículo, "congela" os preços nos itens e fecha as contas
 * (RN-09, RN-08). Serve para criar e para editar.
 */
async function montar(dados: DadosOrcamento, ator: UsuarioSessao) {
  // RN-10 aqui também, e não só no schema: a regra não pode depender de quem chamou.
  if (dados.servicos.length + dados.pecas.length === 0) {
    throw invalido('O orçamento precisa de ao menos 1 serviço ou peça');
  }
  if (dados.carroId) await validarVeiculoDoCliente(dados.clienteId!, dados.carroId);

  const precos = await precificar(prisma, dados, ator);
  const totais = await fecharTotal(precos, dados.desconto, ator, dados.senhaDono);
  const { validadeOrcamentoDias } = await getOficina();

  return {
    campos: {
      clienteId: dados.clienteId ?? null,
      carroId: dados.carroId ?? null,
      // Só faz sentido guardar o contato solto enquanto não há cadastro de verdade.
      contatoNome: dados.clienteId ? null : (dados.contatoNome ?? null),
      contatoTelefone: dados.clienteId ? null : (dados.contatoTelefone ?? null),
      veiculoDescricao: dados.carroId ? null : (dados.veiculoDescricao ?? null),
      // Vale até o fim do último dia.
      validade: fimDoDia(adicionarDias(new Date(), dados.validadeDias ?? validadeOrcamentoDias)),
      ...totais,
      observacoes: dados.observacoes ?? null,
    },
    servicos: precos.servicos.map((s) => ({ servicoId: s.servicoId, quantidade: s.quantidade, precoUnit: s.precoUnit })),
    pecas: precos.pecas.map((p) => ({ pecaId: p.pecaId, quantidade: p.quantidade, precoUnit: p.precoUnit })),
  };
}

export async function criar(dados: DadosOrcamento, ator: UsuarioSessao): Promise<OrcamentoDTO> {
  const { campos, servicos, pecas } = await montar(dados, ator);
  const o = await prisma.orcamento.create({
    data: { ...campos, servicos: { create: servicos }, pecas: { create: pecas } },
    include: incluirCompleto,
  });
  return paraDTO(o);
}

/**
 * Edita um orçamento que ainda não virou OS (corrigir sem refazer).
 * Aprovado é intocável: já gerou Ordem de Serviço e baixou estoque.
 */
export async function atualizar(id: string, dados: DadosOrcamento, ator: UsuarioSessao): Promise<OrcamentoDTO> {
  const atual = await prisma.orcamento.findUnique({ where: { id }, include: { ordem: true } });
  if (!atual) throw naoEncontrado('Orçamento não encontrado');
  if (atual.ordem || atual.status === 'APROVADO') {
    throw conflito('Este orçamento já virou uma Ordem de Serviço e não pode ser alterado');
  }

  const { campos, servicos, pecas } = await montar(dados, ator);
  // RN-06: editar renova a validade, então o orçamento sai do limbo de EXPIRADO.
  const status = atual.status === 'EXPIRADO' ? ('RASCUNHO' as const) : atual.status;

  // Troca os itens por inteiro: é o que a tela manda, e evita casar item a item.
  const o = await prisma.$transaction(async (tx) => {
    // Primeiro a versão (ADR 0010): se alguém salvou no meio, nada é trocado.
    const r = await tx.orcamento.updateMany({ where: { id, ...naVersao(dados.versao) }, data: proximaVersao });
    if (r.count === 0) await falhaDeVersao('orcamentos', id, true, 'Orçamento não encontrado');
    await tx.orcamentoServico.deleteMany({ where: { orcamentoId: id } });
    await tx.orcamentoPeca.deleteMany({ where: { orcamentoId: id } });
    return tx.orcamento.update({
      where: { id },
      data: { ...campos, status, servicos: { create: servicos }, pecas: { create: pecas } },
      include: incluirCompleto,
    });
  });
  return paraDTO(o);
}

/** Apaga um orçamento que não virou OS. Os itens saem junto (cascade). */
export async function excluir(id: string) {
  const atual = await prisma.orcamento.findUnique({ where: { id }, include: { ordem: true } });
  if (!atual) throw naoEncontrado('Orçamento não encontrado');
  if (atual.ordem) throw conflito('Este orçamento já virou uma Ordem de Serviço e não pode ser excluído');
  await prisma.orcamento.delete({ where: { id } });
}

export async function alterarStatus(id: string, status: z.output<typeof statusOrcamentoSchema>['status']) {
  const o = await prisma.orcamento.findUnique({ where: { id } });
  if (!o) throw naoEncontrado('Orçamento não encontrado');
  if (o.status === 'APROVADO') throw conflito('Orçamento aprovado já virou OS e não muda de situação');
  if (o.status === 'EXPIRADO' && status !== 'RECUSADO') {
    throw conflito('Orçamento expirado: edite-o (renova a validade) ou refaça com os preços de hoje');
  }
  await prisma.orcamento.update({ where: { id }, data: { status } });
  return buscar(id);
}

/**
 * Transforma um orçamento RÁPIDO em completo: amarra a um cliente e veículo
 * cadastrados, sem redigitar os itens. É o "aquele preço que vocês me passaram
 * por telefone" — o cliente voltou, agora tem cadastro, e o orçamento vale.
 */
export async function identificar(id: string, clienteId: string, carroId: string) {
  const o = await prisma.orcamento.findUnique({ where: { id }, include: { ordem: true } });
  if (!o) throw naoEncontrado('Orçamento não encontrado');
  if (o.ordem) throw conflito('Este orçamento já virou uma Ordem de Serviço');
  if (o.clienteId && o.carroId) throw invalido('Este orçamento já está identificado');

  await validarVeiculoDoCliente(clienteId, carroId);
  await prisma.orcamento.update({
    where: { id },
    data: { clienteId, carroId, contatoNome: null, contatoTelefone: null, veiculoDescricao: null },
  });
  return buscar(id);
}

/**
 * "Refazer com os preços de hoje": copia um orçamento (tipicamente um
 * expirado) com os preços atuais do catálogo e validade nova. Itens que
 * saíram do catálogo ficam de fora.
 */
export async function duplicar(id: string, ator: UsuarioSessao): Promise<OrcamentoDTO> {
  const o = await prisma.orcamento.findUnique({
    where: { id },
    include: {
      servicos: { include: { servico: { select: { ativo: true } } } },
      pecas: { include: { peca: { select: { ativo: true } } } },
    },
  });
  if (!o) throw naoEncontrado('Orçamento não encontrado');

  const servicos = o.servicos.filter((s) => s.servico.ativo).map((s) => ({ servicoId: s.servicoId, quantidade: s.quantidade }));
  const pecas = o.pecas.filter((p) => p.peca.ativo).map((p) => ({ pecaId: p.pecaId, quantidade: num(p.quantidade) }));
  if (servicos.length + pecas.length === 0) throw conflito('Nenhum item deste orçamento está mais no catálogo');

  return criar(
    {
      clienteId: o.clienteId,
      carroId: o.carroId,
      contatoNome: o.contatoNome,
      contatoTelefone: o.contatoTelefone,
      veiculoDescricao: o.veiculoDescricao,
      desconto: 0,
      observacoes: o.observacoes,
      servicos,
      pecas,
    },
    ator,
  );
}

/**
 * RN-07 (o fluxo-estrela): aprova o orçamento e gera a OS em 1 passo,
 * copiando os itens com os preços combinados e baixando o estoque (RN-01).
 */
export async function aprovar(
  id: string,
  dados: z.output<typeof aprovarOrcamentoSchema>,
  ator: UsuarioSessao,
): Promise<AprovacaoDTO> {
  const orc = await prisma.orcamento.findUnique({ where: { id }, include: { servicos: true, pecas: true, ordem: true } });
  if (!orc) throw naoEncontrado('Orçamento não encontrado');
  if (orc.ordem) throw conflito('Este orçamento já virou uma Ordem de Serviço');
  if (orc.status === 'RECUSADO') throw invalido('Orçamento recusado não pode virar OS');

  // RN-06: a data é a fonte da verdade — o status pode estar velho numa tela aberta.
  if (orc.status === 'EXPIRADO' || orc.validade < new Date()) {
    throw invalido('Orçamento expirado. Refaça o orçamento com os preços de hoje.');
  }

  // O orçamento rápido não tem dono nem veículo. Aqui isso deixa de ser
  // opcional: a OS baixa estoque, dá garantia e entra no histórico do carro.
  const clienteId = orc.clienteId ?? dados.clienteId;
  const carroId = orc.carroId ?? dados.carroId;
  if (!clienteId || !carroId) {
    throw new AppError(
      400,
      'Este é um orçamento rápido. Informe o cliente e o veículo para abrir a Ordem de Serviço.',
      COD.CADASTRO_NECESSARIO,
    );
  }
  if (!orc.carroId) await validarVeiculoDoCliente(clienteId, carroId);
  if (dados.mecanicoId) await validarMecanico(dados.mecanicoId);

  const pecas = orc.pecas.map((p) => ({ pecaId: p.pecaId, quantidade: num(p.quantidade), precoUnit: num(p.precoUnit) }));

  // RN-03: faltando peça, a OS só nasce se o balcão confirmar a encomenda.
  const faltas = await verificarFaltas(prisma, pecas);
  if (faltas.length > 0 && !dados.confirmarSemEstoque) {
    throw conflito(
      `Falta peça no estoque: ${faltas.map((f) => f.nome).join(', ')}. Confirme para encomendar — a OS nasce "aguardando peça".`,
      COD.ESTOQUE_INSUFICIENTE,
      faltas,
    );
  }

  const os = await prisma.$transaction(async (tx) => {
    const criada = await abrirOS(tx, {
      orcamentoId: orc.id,
      clienteId,
      carroId,
      mecanicoId: dados.mecanicoId ?? null,
      kmEntrada: dados.kmEntrada ?? null,
      defeitoRelatado: dados.defeitoRelatado ?? null,
      dataPrevista: dados.dataPrevista ? new Date(dados.dataPrevista) : null,
      subtotal: num(orc.subtotal),
      desconto: num(orc.desconto),
      total: num(orc.total),
      servicos: orc.servicos.map((s) => ({ servicoId: s.servicoId, quantidade: s.quantidade, precoUnit: num(s.precoUnit) })),
      pecas,
      aguardandoPeca: faltas.length > 0,
      usuarioId: ator.id,
    });

    await tx.orcamento.update({
      where: { id: orc.id },
      data: {
        status: 'APROVADO',
        clienteId,
        carroId,
        // O contato solto perde a razão de existir quando há cadastro.
        contatoNome: null,
        contatoTelefone: null,
        veiculoDescricao: null,
      },
    });
    return criada;
  });

  const resumo = await prisma.ordemServico.findUniqueOrThrow({ where: { id: os.id }, include: incluirOSResumo });
  return { os: paraOSResumo(resumo), aguardandoPeca: faltas.length > 0 };
}
