import { z } from 'zod';
import { TIPOS_ITEM_ESTOQUE, TIPOS_PESSOA } from '../enums.js';
import { tipoDoDocumento } from '../validacao.js';
import {
  booleanoQuery,
  dinheiro,
  documentoOpcional,
  emailOpcional,
  id,
  idOpcional,
  kmOpcional,
  paginacaoQuery,
  placa,
  quantidadeEstoque,
  quantidadePeca,
  telefoneOpcional,
  texto,
  textoOpcional,
  versao,
} from './comum.js';

// Clientes, veículos, serviços, peças e distribuidores.

// ---- Clientes --------------------------------------------------------------

export const clienteSchema = z
  .object({
    nome: texto('Informe o nome (ao menos 2 letras)', 120, 2),
    tipo: z.enum(TIPOS_PESSOA).default('PF'),
    cpfCnpj: documentoOpcional,
    telefone: telefoneOpcional,
    whatsapp: telefoneOpcional,
    email: emailOpcional,
    endereco: textoOpcional(300),
    observacoes: textoOpcional(1000),
    versao,
  })
  .superRefine((c, ctx) => {
    const tipoDoc = c.cpfCnpj ? tipoDoDocumento(c.cpfCnpj) : null;
    if (tipoDoc && tipoDoc !== c.tipo) {
      ctx.addIssue({
        code: 'custom',
        path: ['cpfCnpj'],
        message: c.tipo === 'PF' ? 'Pessoa física usa CPF (11 números)' : 'Pessoa jurídica usa CNPJ (14 caracteres)',
      });
    }
  });
export type ClienteInput = z.input<typeof clienteSchema>;

export const listarClientesQuery = paginacaoQuery;

// ---- Veículos --------------------------------------------------------------

const anoValido = (ano: number) => ano >= 1900 && ano <= new Date().getFullYear() + 1;

export const carroSchema = z.object({
  clienteId: id('Selecione o cliente dono do veículo'),
  placa,
  marca: texto('Informe a marca', 60),
  modelo: texto('Informe o modelo', 80),
  ano: z.number().int('Ano inválido').refine(anoValido, 'Ano inválido').nullable().optional(),
  cor: textoOpcional(40),
  kmAtual: kmOpcional,
  chassi: z
    .string()
    .trim()
    .toUpperCase()
    .max(17, 'O chassi tem no máximo 17 caracteres')
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
  combustivel: textoOpcional(30),
  observacoes: textoOpcional(1000),
  versao,
});
export type CarroInput = z.input<typeof carroSchema>;

export const listarCarrosQuery = paginacaoQuery.extend({ clienteId: z.string().optional() });

// ---- Serviços (catálogo de mão de obra) ------------------------------------

export const servicoSchema = z.object({
  nome: texto('Informe o nome do serviço', 120, 2),
  descricao: textoOpcional(500),
  precoMaoDeObra: dinheiro('Informe o preço da mão de obra'),
  tempoEstimadoMin: z.number().int('Use minutos inteiros').min(0).max(100_000).nullable().optional(),
  categoria: textoOpcional(60),
  versao,
});
export type ServicoInput = z.input<typeof servicoSchema>;

export const listarServicosQuery = paginacaoQuery;

// ---- Peças / estoque -------------------------------------------------------

const pecaBase = {
  nome: texto('Informe o nome da peça', 120, 2),
  codigoBarras: z
    .string()
    .trim()
    .max(50)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
  sku: textoOpcional(50),
  tipo: z.enum(TIPOS_ITEM_ESTOQUE).default('PECA'),
  fornecedorId: idOpcional,
  precoCusto: dinheiro('Informe o custo'),
  precoVenda: dinheiro('Informe o preço de venda'),
  estoqueMinimo: quantidadeEstoque.default(0),
  unidade: z.string().trim().min(1, 'Informe a unidade').max(10).default('un'),
  localizacao: textoOpcional(60),
  versao,
};

/**
 * O estoque NÃO se edita pelo cadastro: toda mudança de quantidade passa
 * por um movimento (entrada, saída na OS, ajuste de inventário). Senão o
 * histórico da peça deixa de fechar com o saldo.
 */
export const pecaSchema = z.object(pecaBase);
export type PecaInput = z.input<typeof pecaSchema>;

export const criarPecaSchema = z.object({ ...pecaBase, estoqueInicial: quantidadeEstoque.default(0) });
export type CriarPecaInput = z.input<typeof criarPecaSchema>;

export const listarPecasQuery = paginacaoQuery.extend({
  baixo: booleanoQuery,
  fornecedorId: z.string().optional(),
});

/** Entrada de mercadoria (reposição, leitor de código de barras). */
export const entradaEstoqueSchema = z.object({
  quantidade: quantidadePeca,
  /** Só o Dono informa custo — é o que recalcula o custo médio (RN-04). */
  custoUnit: dinheiro().nullable().optional(),
  motivo: textoOpcional(200),
});
export type EntradaEstoqueInput = z.input<typeof entradaEstoqueSchema>;

/** Inventário: o que foi CONTADO na prateleira. O sistema calcula a diferença. */
export const ajusteEstoqueSchema = z.object({
  estoqueContado: quantidadeEstoque,
  motivo: texto('Explique o motivo do ajuste', 200),
});
export type AjusteEstoqueInput = z.input<typeof ajusteEstoqueSchema>;

export const movimentosQuery = paginacaoQuery;

// ---- Distribuidores (fornecedores) -----------------------------------------

export const fornecedorSchema = z.object({
  nome: texto('Informe o nome do distribuidor', 120, 2),
  cnpj: documentoOpcional,
  contato: textoOpcional(80),
  telefone: telefoneOpcional,
  email: emailOpcional,
  prazoEntrega: z.number().int().min(0).max(365).nullable().optional(),
  observacoes: textoOpcional(500),
  versao,
});
export type FornecedorInput = z.input<typeof fornecedorSchema>;
