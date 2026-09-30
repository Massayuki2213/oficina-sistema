import { z } from 'zod';
import { FORMAS_A_VISTA, FORMAS_SAIDA, ORIGENS_LANCAMENTO, STATUS_COMPRA, STATUS_PARCELA, TIPOS_LANCAMENTO } from '../enums.js';
import {
  booleanoQuery,
  dataISO,
  dataISOOpcional,
  dinheiro,
  dinheiroPositivo,
  id,
  idOpcional,
  paginacaoQuery,
  periodoQuery,
  quantidadePeca,
  texto,
  textoOpcional,
  versao,
} from './comum.js';

// Caixa, despesas, contas a receber, compras, relatórios e auditoria.

// ---- Livro-caixa -----------------------------------------------------------

/**
 * Lançamento manual. A origem diz o que o dinheiro É, e isso muda o lucro:
 * APORTE e RETIRADA são dinheiro do dono (não são faturamento nem despesa);
 * VENDA_BALCAO é receita; DESPESA é gasto da oficina.
 */
export const lancamentoSchema = z
  .object({
    tipo: z.enum(TIPOS_LANCAMENTO),
    origem: z.enum(['APORTE', 'VENDA_BALCAO', 'RETIRADA', 'DESPESA']),
    descricao: texto('Descreva o lançamento', 200, 2),
    valor: dinheiroPositivo(),
    formaPagamento: z.enum(FORMAS_SAIDA).nullable().optional(),
    categoria: textoOpcional(60),
    /** Sem data, vale hoje. */
    data: dataISOOpcional,
  })
  .refine(
    (l) =>
      l.tipo === 'ENTRADA' ? l.origem === 'APORTE' || l.origem === 'VENDA_BALCAO' : l.origem === 'RETIRADA' || l.origem === 'DESPESA',
    { message: 'A origem não combina com o tipo do lançamento', path: ['origem'] },
  );
export type LancamentoInput = z.input<typeof lancamentoSchema>;

export const listarCaixaQuery = paginacaoQuery.extend({
  ...periodoQuery.shape,
  tipo: z.enum(TIPOS_LANCAMENTO).optional(),
  origem: z.enum(ORIGENS_LANCAMENTO).optional(),
});

export const resumoDiaQuery = z.object({ data: dataISO.optional() });

// ---- Despesas --------------------------------------------------------------

const despesaBase = {
  categoria: texto('Informe a categoria (ex: aluguel, energia)', 60, 2),
  descricao: texto('Descreva a despesa', 200, 2),
  valor: dinheiroPositivo(),
  /** Vencimento. Sem data, vale hoje. */
  data: dataISOOpcional,
  fornecedorId: idOpcional,
  recorrente: z.boolean().default(false),
};

export const despesaSchema = z.object({ ...despesaBase, versao });
export type DespesaInput = z.input<typeof despesaSchema>;

export const criarDespesaSchema = z.object({
  ...despesaBase,
  /** Já nasceu paga: a saída entra no caixa na hora (RN-12). */
  pago: z.boolean().default(false),
  formaPagamento: z.enum(FORMAS_SAIDA).nullable().optional(),
});
export type CriarDespesaInput = z.input<typeof criarDespesaSchema>;

export const pagarDespesaSchema = z.object({
  formaPagamento: z.enum(FORMAS_SAIDA).default('A_VISTA'),
  /** Data do pagamento. Sem data, vale hoje. */
  data: dataISOOpcional,
});
export type PagarDespesaInput = z.input<typeof pagarDespesaSchema>;

export const listarDespesasQuery = paginacaoQuery.extend({
  ...periodoQuery.shape,
  categoria: z.string().trim().max(60).optional(),
  situacao: z.enum(['PENDENTE', 'PAGA', 'VENCIDA']).optional(),
});

// ---- Contas a receber (fiado / parcelado) ----------------------------------

/** Baixa de parcela. Sem valor, quita o saldo inteiro; com valor menor, baixa parcial. */
export const receberParcelaSchema = z.object({
  formaPagamento: z.enum(FORMAS_A_VISTA).default('A_VISTA'),
  valor: dinheiroPositivo().optional(),
});
export type ReceberParcelaInput = z.input<typeof receberParcelaSchema>;

/**
 * Fiado lançado à mão — sobretudo na implantação, para passar o caderno
 * de fiado para o sistema sem inventar uma OS.
 */
export const lancarFiadoSchema = z.object({
  clienteId: id('Selecione o cliente'),
  descricao: texto('Descreva a dívida (ex: "fiado do caderno")', 200, 2),
  valor: dinheiroPositivo(),
  parcelas: z.number().int().min(1).max(24).default(1),
  primeiroVencimento: dataISO,
});
export type LancarFiadoInput = z.input<typeof lancarFiadoSchema>;

export const listarContasQuery = paginacaoQuery.extend({
  clienteId: z.string().optional(),
  status: z.enum(STATUS_PARCELA).optional(),
  atrasadas: booleanoQuery,
});

// ---- Compras (contas a pagar) ----------------------------------------------

/** Item: uma peça que já existe OU uma peça nova cadastrada na hora. */
const itemCompraSchema = z
  .object({
    pecaId: idOpcional,
    pecaNova: z
      .object({
        nome: texto('Informe o nome da peça', 120, 2),
        precoVenda: dinheiro('Informe o preço de venda'),
        unidade: z.string().trim().min(1).max(10).default('un'),
        codigoBarras: textoOpcional(50),
      })
      .nullable()
      .optional(),
    quantidade: quantidadePeca,
    custoUnit: dinheiro('Informe o custo'),
  })
  .refine((i) => !!i.pecaId !== !!i.pecaNova, {
    message: 'Escolha uma peça do estoque ou cadastre uma nova (um dos dois)',
    path: ['pecaId'],
  });

export const compraSchema = z.object({
  fornecedorId: id('Selecione o distribuidor'),
  /** Data da compra. Sem data, vale hoje. */
  data: dataISOOpcional,
  /** Vencimento do boleto, na compra a prazo. */
  vencimento: dataISOOpcional,
  numeroNota: textoOpcional(60),
  observacoes: textoOpcional(500),
  /** À vista: sai do caixa na hora. A prazo (padrão): fica em "a pagar". */
  pago: z.boolean().default(false),
  formaPagamento: z.enum(FORMAS_SAIDA).nullable().optional(),
  itens: z.array(itemCompraSchema).min(1, 'Adicione ao menos um item à compra').max(200, 'Itens demais'),
});
export type CompraInput = z.input<typeof compraSchema>;

export const pagarCompraSchema = z.object({ formaPagamento: z.enum(FORMAS_SAIDA).default('TRANSFERENCIA') });

export const listarComprasQuery = paginacaoQuery.extend({
  ...periodoQuery.shape,
  fornecedorId: z.string().optional(),
  status: z.enum(STATUS_COMPRA).optional(),
});

// ---- Relatórios e auditoria ------------------------------------------------

export const evolucaoQuery = z.object({ meses: z.coerce.number().int().min(1).max(24).default(12) });

export const listarAuditoriaQuery = paginacaoQuery.extend({
  ...periodoQuery.shape,
  entidade: z.string().trim().max(40).optional(),
  usuarioId: z.string().optional(),
});
