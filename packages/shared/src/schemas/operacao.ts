import { z } from 'zod';
import {
  FORMAS_A_PRAZO,
  FORMAS_A_VISTA,
  STATUS_ORCAMENTO,
  STATUS_OS,
  STATUS_VISITA,
  TIPOS_VISITA,
} from '../enums.js';
import {
  booleanoQuery,
  dataHora,
  dataHoraOpcional,
  dataISO,
  dinheiro,
  dinheiroPositivo,
  id,
  idOpcional,
  kmOpcional,
  paginacaoQuery,
  periodoQuery,
  quantidadePeca,
  quantidadeServico,
  senhaDono,
  telefoneOpcional,
  texto,
  textoOpcional,
  versao,
} from './comum.js';

// Orçamento, Ordem de Serviço, venda de balcão e agenda.

// ---- Itens (os mesmos no orçamento, na OS e na venda) ----------------------

/**
 * `precoUnit` é opcional: sem ele vale o preço do catálogo. Informado, é o
 * preço combinado com o cliente (RN-05: "pode editar na hora"). Baixar o
 * preço conta como desconto para o teto da RN-08.
 */
export const itemServicoSchema = z.object({
  servicoId: id('Escolha o serviço'),
  quantidade: quantidadeServico.default(1),
  precoUnit: dinheiro().optional(),
});
export type ItemServicoInput = z.input<typeof itemServicoSchema>;

export const itemPecaSchema = z.object({
  pecaId: id('Escolha a peça'),
  quantidade: quantidadePeca.default(1),
  precoUnit: dinheiro().optional(),
});
export type ItemPecaInput = z.input<typeof itemPecaSchema>;

const semRepetidos = (chaves: string[]) => new Set(chaves).size === chaves.length;

const listaServicos = z
  .array(itemServicoSchema)
  .max(100, 'Itens demais')
  .refine((itens) => semRepetidos(itens.map((i) => i.servicoId)), 'Serviço repetido — aumente a quantidade na linha que já existe')
  .default([]);

const listaPecas = z
  .array(itemPecaSchema)
  .max(100, 'Itens demais')
  .refine((itens) => semRepetidos(itens.map((i) => i.pecaId)), 'Peça repetida — aumente a quantidade na linha que já existe')
  .default([]);

// ---- Orçamento -------------------------------------------------------------

export const orcamentoSchema = z
  .object({
    // ORÇAMENTO RÁPIDO: sem cliente e sem veículo cadastrados. Quem só quer
    // saber um preço não passa por dois cadastros antes de ouvir o valor.
    clienteId: idOpcional,
    carroId: idOpcional,
    contatoNome: textoOpcional(120),
    contatoTelefone: telefoneOpcional,
    veiculoDescricao: textoOpcional(120),
    /** Sem valor, vale a validade padrão configurada na oficina. */
    validadeDias: z.number().int().min(1, 'Validade inválida').max(180, 'Validade de no máximo 180 dias').optional(),
    desconto: dinheiro().default(0),
    senhaDono,
    observacoes: textoOpcional(1000),
    servicos: listaServicos,
    pecas: listaPecas,
    versao,
  })
  .refine((d) => d.servicos.length + d.pecas.length > 0, {
    message: 'Adicione ao menos 1 serviço ou peça',
    path: ['servicos'],
  })
  .refine((d) => !d.carroId || !!d.clienteId, {
    message: 'Selecione o cliente dono deste veículo',
    path: ['clienteId'],
  });
export type OrcamentoInput = z.input<typeof orcamentoSchema>;

export const listarOrcamentosQuery = paginacaoQuery.extend({ status: z.enum(STATUS_ORCAMENTO).optional() });

/** Mudança manual. APROVADO tem rota própria; EXPIRADO é automático (RN-06). */
export const statusOrcamentoSchema = z.object({ status: z.enum(['RASCUNHO', 'ENVIADO', 'RECUSADO']) });

export const identificarOrcamentoSchema = z.object({
  clienteId: id('Selecione o cliente'),
  carroId: id('Selecione o veículo'),
});

/** O que a oficina anota quando o carro entra: KM, queixa do cliente, previsão. */
const aberturaOS = {
  mecanicoId: idOpcional,
  kmEntrada: kmOpcional,
  defeitoRelatado: textoOpcional(1000),
  dataPrevista: dataHoraOpcional,
};

/**
 * Aprovar = gerar a OS (RN-07). O orçamento rápido informa aqui o cliente
 * e o veículo: se o serviço vai ser feito, o carro está na oficina.
 * `confirmarSemEstoque` é o "sim, encomendar" da RN-03.
 */
export const aprovarOrcamentoSchema = z.object({
  ...aberturaOS,
  clienteId: idOpcional,
  carroId: idOpcional,
  confirmarSemEstoque: z.boolean().default(false),
});
export type AprovarOrcamentoInput = z.input<typeof aprovarOrcamentoSchema>;

// ---- Ordem de Serviço ------------------------------------------------------

/** OS direta, sem orçamento (ex.: troca de óleo com o cliente esperando). */
export const criarOSSchema = z.object({
  clienteId: id('Selecione o cliente'),
  carroId: id('Selecione o veículo'),
  ...aberturaOS,
  desconto: dinheiro().default(0),
  senhaDono,
  servicos: listaServicos,
  pecas: listaPecas,
  confirmarSemEstoque: z.boolean().default(false),
});
export type CriarOSInput = z.input<typeof criarOSSchema>;

/** Dados gerais da OS (todos opcionais: manda só o que mudou). */
export const atualizarOSSchema = z.object({
  kmEntrada: kmOpcional,
  defeitoRelatado: textoOpcional(1000),
  /** Laudo / diagnóstico do mecânico. */
  observacoes: textoOpcional(4000),
  dataPrevista: dataHoraOpcional,
  desconto: dinheiro().optional(),
  senhaDono,
  versao,
});
export type AtualizarOSInput = z.input<typeof atualizarOSSchema>;

export const itemParams = z.object({ id: id(), itemId: id() });

export const adicionarServicoOSSchema = itemServicoSchema.extend({ senhaDono });
export type AdicionarServicoOSInput = z.input<typeof adicionarServicoOSSchema>;

export const alterarServicoOSSchema = z.object({
  quantidade: quantidadeServico.optional(),
  precoUnit: dinheiro().optional(),
  /** Apontamento do mecânico: "este serviço está feito". */
  concluido: z.boolean().optional(),
  senhaDono,
});
export type AlterarServicoOSInput = z.input<typeof alterarServicoOSSchema>;

export const adicionarPecaOSSchema = itemPecaSchema.extend({
  confirmarSemEstoque: z.boolean().default(false),
  senhaDono,
});
export type AdicionarPecaOSInput = z.input<typeof adicionarPecaOSSchema>;

export const alterarPecaOSSchema = z.object({
  quantidade: quantidadePeca.optional(),
  precoUnit: dinheiro().optional(),
  confirmarSemEstoque: z.boolean().default(false),
  senhaDono,
});
export type AlterarPecaOSInput = z.input<typeof alterarPecaOSSchema>;

/** CANCELADA tem rota própria (pede motivo e devolve as peças ao estoque). */
export const mudarStatusOSSchema = z.object({
  status: z.enum(['EM_EXECUCAO', 'AGUARDANDO_PECA', 'AGUARDANDO_APROVACAO', 'CONCLUIDA', 'ENTREGUE']),
});
export type MudarStatusOSInput = z.input<typeof mudarStatusOSSchema>;

export const atribuirMecanicoSchema = z.object({ mecanicoId: z.string().trim().min(1).nullable() });

export const cancelarOSSchema = z.object({ motivo: texto('Informe o motivo do cancelamento', 300) });

/**
 * Receber (RN-11 / RN-11.1). Um ou mais pagamentos na hora (dinheiro, PIX,
 * cartão) e, opcionalmente, o restante a prazo em parcelas. A soma tem que
 * fechar com o total da OS — o servidor confere.
 */
export const receberOSSchema = z
  .object({
    pagamentos: z
      .array(z.object({ forma: z.enum(FORMAS_A_VISTA), valor: dinheiroPositivo() }))
      .max(5, 'Pagamentos demais')
      .default([]),
    prazo: z
      .object({
        forma: z.enum(FORMAS_A_PRAZO),
        parcelas: z.number().int().min(1, 'Mínimo 1 parcela').max(24, 'Máximo 24 parcelas'),
        primeiroVencimento: dataISO,
      })
      .nullable()
      .optional(),
    /** RN-11.2: liberar fiado para quem está devendo é decisão consciente — fica na auditoria. */
    liberarFiado: z.boolean().default(false),
  })
  .refine((d) => d.pagamentos.length > 0 || !!d.prazo, {
    message: 'Informe como o cliente vai pagar',
    path: ['pagamentos'],
  });
export type ReceberOSInput = z.input<typeof receberOSSchema>;

export const estornarPagamentoSchema = z.object({ motivo: texto('Informe o motivo do estorno', 300) });

export const abrirGarantiaSchema = z.object({
  mecanicoId: idOpcional,
  defeitoRelatado: textoOpcional(1000),
});

export const listarOSQuery = paginacaoQuery.extend({
  status: z.enum(STATUS_OS).optional(),
  /** Só as que ainda estão na oficina (não entregues nem canceladas). */
  abertas: booleanoQuery,
  mecanicoId: z.string().optional(),
  clienteId: z.string().optional(),
  carroId: z.string().optional(),
});

// ---- Venda de balcão -------------------------------------------------------

export const vendaSchema = z.object({
  clienteId: idOpcional,
  itens: z
    .array(itemPecaSchema)
    .min(1, 'Adicione ao menos uma peça')
    .max(100, 'Itens demais')
    .refine((itens) => semRepetidos(itens.map((i) => i.pecaId)), 'Peça repetida — aumente a quantidade na linha que já existe'),
  desconto: dinheiro().default(0),
  senhaDono,
  formaPagamento: z.enum(FORMAS_A_VISTA, { error: 'Escolha a forma de pagamento' }),
  observacoes: textoOpcional(500),
  confirmarSemEstoque: z.boolean().default(false),
});
export type VendaInput = z.input<typeof vendaSchema>;

export const listarVendasQuery = paginacaoQuery.extend(periodoQuery.shape);

export const cancelarVendaSchema = z.object({ motivo: texto('Informe o motivo', 300) });

// ---- Agenda ----------------------------------------------------------------

export const visitaSchema = z.object({
  clienteId: id('Selecione o cliente'),
  carroId: idOpcional,
  dataHora,
  tipo: z.enum(TIPOS_VISITA).default('REVISAO'),
  observacoes: textoOpcional(500),
  /** RN-19: o atendente viu o conflito e quer encaixar mesmo assim. */
  ignorarConflito: z.boolean().default(false),
});
export type VisitaInput = z.input<typeof visitaSchema>;

export const atualizarVisitaSchema = z.object({
  carroId: idOpcional,
  dataHora: dataHora.optional(),
  tipo: z.enum(TIPOS_VISITA).optional(),
  observacoes: textoOpcional(500),
  ignorarConflito: z.boolean().default(false),
  versao,
});
export type AtualizarVisitaInput = z.input<typeof atualizarVisitaSchema>;

export const statusVisitaSchema = z.object({ status: z.enum(STATUS_VISITA) });

export const listarAgendaQuery = periodoQuery.extend({ status: z.enum(STATUS_VISITA).optional() });
