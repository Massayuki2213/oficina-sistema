// ============================================================
// Entidades do domínio (seção 4 do PLANEJAMENTO.md).
// Tipos framework-agnósticos, compartilhados entre a API e o
// app Desktop. São o "contrato" que trafega pela rede (JSON).
//
// Convenções:
//  - `ISODate` = data em texto ISO 8601 (ex: "2026-07-02T14:00:00Z"),
//    porque é assim que a data chega no JSON da API.
//  - Valores monetários em `number` (reais). A API converte do
//    Decimal do banco antes de enviar.
//  - Campos de relação (ex: `carros`, `itens`) são opcionais:
//    só vêm quando a API decide incluí-los.
// ============================================================

import type {
  FormaPagamento,
  OrigemLancamento,
  Perfil,
  StatusOS,
  StatusOrcamento,
  StatusParcela,
  StatusVisita,
  TipoItemEstoque,
  TipoLancamento,
  TipoMovimentoEstoque,
  TipoPessoa,
  TipoVisita,
} from './enums.js';

export type ID = string;
export type ISODate = string;

/** Campos comuns a toda entidade persistida. */
export interface BaseEntity {
  id: ID;
}

// ---------------------- USUÁRIO / ACESSO ----------------------

export interface Usuario extends BaseEntity {
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  criadoEm: ISODate;
  // senhaHash nunca trafega para o cliente.
}

// ---------------------- CADASTROS ----------------------

export interface Cliente extends BaseEntity {
  nome: string;
  tipo: TipoPessoa;
  cpfCnpj?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  endereco?: string | null;
  observacoes?: string | null;
  ativo: boolean;
  dataCadastro: ISODate;

  // Relações (opcionais)
  carros?: Carro[];
}

/** Cliente com dados calculados para telas (ex: detalhe/histórico). */
export interface ClienteDetalhado extends Cliente {
  ordens?: OrdemServico[];
  contasReceber?: ContaReceber[];
  /** Soma das parcelas em aberto (fiado). RN-11.2 */
  fiadoEmAberto: number;
  temAtraso: boolean;
}

export interface Carro extends BaseEntity {
  clienteId: ID;
  placa: string;
  marca: string;
  modelo: string;
  ano?: number | null;
  cor?: string | null;
  kmAtual?: number | null;
  chassi?: string | null;
  combustivel?: string | null;
  observacoes?: string | null;

  cliente?: Cliente;
}

export interface Servico extends BaseEntity {
  nome: string;
  descricao?: string | null;
  precoMaoDeObra: number;
  tempoEstimadoMin?: number | null;
  categoria?: string | null;
  ativo: boolean;
}

export interface Fornecedor extends BaseEntity {
  nome: string;
  cnpj?: string | null;
  contato?: string | null;
  telefone?: string | null;
  prazoEntregaDias?: number | null;
  observacoes?: string | null;
}

export interface Peca extends BaseEntity {
  nome: string;
  sku?: string | null;
  tipo: TipoItemEstoque;
  fornecedorId?: ID | null;
  precoCusto: number;
  precoVenda: number;
  margemPct?: number | null;
  estoqueAtual: number;
  estoqueMinimo: number;
  unidade: string;
  localizacao?: string | null;
  ativo: boolean;

  fornecedor?: Fornecedor;
  /** true quando estoqueAtual <= estoqueMinimo (RN-02). Calculado pela API. */
  estoqueBaixo?: boolean;
}

// ---------------------- ITENS (serviço/peça em orçamento ou OS) ----------------------

/** Linha de serviço, usada tanto no orçamento quanto na OS. */
export interface ItemServico extends BaseEntity {
  servicoId: ID;
  quantidade: number;
  precoUnit: number;
  servico?: Servico;
}

/** Linha de peça, usada tanto no orçamento quanto na OS. */
export interface ItemPeca extends BaseEntity {
  pecaId: ID;
  quantidade: number;
  precoUnit: number;
  peca?: Peca;
}

// ---------------------- ORÇAMENTO ----------------------

export interface Orcamento extends BaseEntity {
  numero: number;
  clienteId: ID;
  carroId: ID;
  data: ISODate;
  validade: ISODate;
  status: StatusOrcamento;
  subtotal: number;
  desconto: number;
  total: number;
  observacoes?: string | null;

  cliente?: Cliente;
  carro?: Carro;
  servicos?: ItemServico[];
  pecas?: ItemPeca[];
}

// ---------------------- ORDEM DE SERVIÇO ----------------------

export interface OrdemServico extends BaseEntity {
  numero: number;
  orcamentoId?: ID | null;
  clienteId: ID;
  carroId: ID;
  mecanicoId?: ID | null;
  dataAbertura: ISODate;
  dataPrevista?: ISODate | null;
  dataConclusao?: ISODate | null;
  status: StatusOS;
  kmEntrada?: number | null;
  total: number;
  formaPagamento?: FormaPagamento | null;
  pago: boolean;
  garantia: boolean;

  cliente?: Cliente;
  carro?: Carro;
  mecanico?: Usuario;
  servicos?: ItemServico[];
  pecas?: ItemPeca[];
}

// ---------------------- AGENDA / VISITAS ----------------------

export interface Visita extends BaseEntity {
  clienteId: ID;
  carroId?: ID | null;
  dataHora: ISODate;
  tipo: TipoVisita;
  status: StatusVisita;
  observacoes?: string | null;

  cliente?: Cliente;
  carro?: Carro;
}

// ---------------------- FINANCEIRO ----------------------

export interface LancamentoCaixa extends BaseEntity {
  data: ISODate;
  tipo: TipoLancamento;
  origem: OrigemLancamento;
  descricao: string;
  valor: number;
  formaPagamento?: FormaPagamento | null;
  categoria?: string | null;
  osId?: ID | null;
  usuarioId?: ID | null;
}

export interface Despesa extends BaseEntity {
  data: ISODate;
  categoria: string;
  descricao: string;
  valor: number;
  fornecedorId?: ID | null;
  recorrente: boolean;
  pago: boolean;
}

/** Parcela de parcelado/fiado (RN-11.1 / RN-11.2). */
export interface ContaReceber extends BaseEntity {
  clienteId: ID;
  osId?: ID | null;
  parcela: number;
  totalParcelas: number;
  vencimento: ISODate;
  valor: number;
  status: StatusParcela;
  pagoEm?: ISODate | null;
}

// ---------------------- ESTOQUE ----------------------

export interface MovimentoEstoque extends BaseEntity {
  pecaId: ID;
  tipo: TipoMovimentoEstoque;
  quantidade: number;
  custoUnit?: number | null;
  motivo?: string | null;
  data: ISODate;
}

// ---------------------- AUDITORIA ----------------------

export interface LogAuditoria extends BaseEntity {
  usuarioId?: ID | null;
  acao: string;
  entidade: string;
  entidadeId?: ID | null;
  detalhes?: string | null;
  data: ISODate;
}
