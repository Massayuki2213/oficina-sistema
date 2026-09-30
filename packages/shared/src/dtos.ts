// ============================================================
// DTOs — o formato EXATO do que a API devolve.
//
// A API monta cada resposta por um "mapeador" que satisfaz estes
// tipos, e a tela os importa em vez de redeclarar interfaces por
// página. Mudou aqui, o TypeScript acusa os dois lados.
//
// Convenções:
//  - datas com hora chegam como ISO 8601 (`ISODate`); datas sem hora,
//    como "AAAA-MM-DD" (`DataISO`);
//  - dinheiro em reais (`number`), já arredondado ao centavo;
//  - campo que o perfil não pode ver chega `null` (ex.: custo da peça).
// ============================================================

import type {
  FormaPagamento,
  OrigemLancamento,
  Perfil,
  StatusCompra,
  StatusOrcamento,
  StatusOS,
  StatusParcela,
  StatusVisita,
  TipoItemEstoque,
  TipoLancamento,
  TipoMovimentoEstoque,
  TipoPessoa,
  TipoVisita,
} from './enums.js';
import type { Permissoes } from './permissions.js';

export type ID = string;
/** "2026-09-29T14:00:00.000Z" */
export type ISODate = string;
/** "2026-09-29" */
export type DataISO = string;

export interface Pagina<T> {
  itens: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

interface Ref {
  id: ID;
  numero: number;
}

// ---- Sessão / sistema ------------------------------------------------------

export interface UsuarioSessao {
  id: ID;
  nome: string;
  email: string;
  perfil: Perfil;
  permissoes: Permissoes;
}

/** Público: o que a tela de login precisa antes de alguém entrar. */
export interface SituacaoSistema {
  versao: string;
  /** Nenhum usuário ainda: mostrar o "primeiro acesso". */
  precisaConfigurar: boolean;
  oficina: { nome: string; logo: string | null };
}

export interface SaudeDTO {
  status: 'ok' | 'degradado';
  versao: string;
  banco: 'up' | 'down';
  horario: ISODate;
  fuso: string;
}

// ---- Usuários / oficina ----------------------------------------------------

export interface UsuarioDTO {
  /** Concorrência otimista (ADR 0010): mande de volta ao salvar o formulário. */
  versao: number;
  id: ID;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  comissaoPct: number | null;
  criadoEm: ISODate;
  ultimoAcesso: ISODate | null;
  /** Aparelhos com sessão aberta agora. */
  sessoesAtivas: number;
}

/** Um aparelho onde a pessoa está logada (ADR 0009). */
export interface SessaoDTO {
  id: ID;
  /** "Edge no Windows", "App Hermes no Windows"... null se o navegador não disse. */
  aparelho: string | null;
  ip: string | null;
  criadaEm: ISODate;
  ultimoUso: ISODate;
  /** É a sessão de quem está vendo a lista. */
  atual: boolean;
}

export interface MembroEquipeDTO {
  id: ID;
  nome: string;
  perfil: Perfil;
}

export interface OficinaDTO {
  /** Concorrência otimista (ADR 0010): mande de volta ao salvar o formulário. */
  versao: number;
  nome: string;
  subtitulo: string | null;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  logo: string | null;
  observacoesDocumento: string | null;
  margemPadrao: number;
  descontoMaxSemSenha: number;
  garantiaDias: number;
  validadeOrcamentoDias: number;
}

// ---- Clientes e veículos ---------------------------------------------------

export interface SituacaoFiadoDTO {
  /** Tudo que o cliente deve (parcelas pendentes). */
  emAberto: number;
  /** A parte já vencida. */
  vencido: number;
  parcelasVencidas: number;
  /** RN-11.2: com parcela vencida, novo fiado só com liberação. */
  bloqueado: boolean;
  vencimentoMaisAntigo: ISODate | null;
}

export interface ClienteResumoDTO {
  /** Concorrência otimista (ADR 0010): mande de volta ao salvar o formulário. */
  versao: number;
  id: ID;
  nome: string;
  tipo: TipoPessoa;
  cpfCnpj: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  qtdVeiculos: number;
}

export interface ClienteDTO extends ClienteResumoDTO {
  endereco: string | null;
  observacoes: string | null;
  ativo: boolean;
  dataCadastro: ISODate;
}

export interface VeiculoResumoDTO {
  id: ID;
  placa: string;
  marca: string;
  modelo: string;
  ano: number | null;
  cor: string | null;
  kmAtual: number | null;
  combustivel: string | null;
}

export interface ClienteFichaDTO extends ClienteDTO {
  veiculos: VeiculoResumoDTO[];
  ordens: OSResumoDTO[];
  parcelasEmAberto: ParcelaDTO[];
  fiado: SituacaoFiadoDTO;
  /** Soma das OS pagas (fora garantias). */
  totalGasto: number;
}

export interface ContatoDTO {
  id: ID;
  nome: string;
  telefone: string | null;
  whatsapp: string | null;
}

export interface CarroDTO extends VeiculoResumoDTO {
  /** Concorrência otimista (ADR 0010): mande de volta ao salvar o formulário. */
  versao: number;
  clienteId: ID;
  chassi: string | null;
  observacoes: string | null;
  ativo: boolean;
  cliente: ContatoDTO;
}

/** Uma linha do histórico do veículo — responde "já mexemos nisso?". */
export interface HistoricoOSDTO {
  id: ID;
  numero: number;
  dataAbertura: ISODate;
  dataConclusao: ISODate | null;
  status: StatusOS;
  total: number;
  pago: boolean;
  garantia: boolean;
  kmEntrada: number | null;
  mecanico: string | null;
  servicos: string[];
}

/** RN-16/17: tudo que o balcão precisa saber quando digita a placa. */
export interface FichaVeiculoDTO extends CarroDTO {
  historico: HistoricoOSDTO[];
  /** null quando o perfil não recebe pagamento (não precisa saber). */
  fiado: SituacaoFiadoDTO | null;
}

// ---- Catálogo e estoque ----------------------------------------------------

export interface ServicoDTO {
  /** Concorrência otimista (ADR 0010): mande de volta ao salvar o formulário. */
  versao: number;
  id: ID;
  nome: string;
  descricao: string | null;
  precoMaoDeObra: number;
  tempoEstimadoMin: number | null;
  categoria: string | null;
  ativo: boolean;
}

export interface PecaDTO {
  /** Concorrência otimista (ADR 0010): mande de volta ao salvar o formulário. */
  versao: number;
  id: ID;
  nome: string;
  sku: string | null;
  codigoBarras: string | null;
  tipo: TipoItemEstoque;
  fornecedor: { id: ID; nome: string } | null;
  precoVenda: number;
  /** null para quem não vê custo. */
  precoCusto: number | null;
  margemPct: number | null;
  estoqueAtual: number;
  estoqueMinimo: number;
  unidade: string;
  localizacao: string | null;
  ativo: boolean;
  /** RN-02: no mínimo ou abaixo dele. */
  estoqueBaixo: boolean;
}

export interface MovimentoEstoqueDTO {
  id: ID;
  data: ISODate;
  tipo: TipoMovimentoEstoque;
  /** Positivo em entrada/saída; no ajuste, a diferença com sinal. */
  quantidade: number;
  /** Saldo da peça logo depois deste movimento (kardex). */
  saldoApos: number | null;
  custoUnit: number | null;
  motivo: string | null;
  usuario: string | null;
  os: Ref | null;
  compra: Ref | null;
  venda: Ref | null;
}

export interface FornecedorDTO {
  /** Concorrência otimista (ADR 0010): mande de volta ao salvar o formulário. */
  versao: number;
  id: ID;
  nome: string;
  cnpj: string | null;
  contato: string | null;
  telefone: string | null;
  email: string | null;
  prazoEntrega: number | null;
  observacoes: string | null;
  /** Soma das compras a prazo em aberto. */
  deve: number;
  comprasAbertas: number;
  qtdPecas: number;
}

// ---- Itens de orçamento / OS / venda ---------------------------------------

export interface ItemServicoDTO {
  id: ID;
  servicoId: ID;
  nome: string;
  quantidade: number;
  precoUnit: number;
  /** Preço de tabela hoje — mostra se houve negociação no item. */
  precoCatalogo: number;
  subtotal: number;
  /** Só na OS: o mecânico apontou como feito. */
  concluido: boolean;
}

export interface ItemPecaDTO {
  id: ID;
  pecaId: ID;
  nome: string;
  unidade: string;
  quantidade: number;
  precoUnit: number;
  precoCatalogo: number;
  subtotal: number;
  /** Saldo atual da peça (para o aviso "só 2 em estoque"). */
  estoqueAtual: number;
}

// ---- Orçamento -------------------------------------------------------------

export interface OrcamentoResumoDTO {
  id: ID;
  numero: number;
  data: ISODate;
  validade: ISODate;
  status: StatusOrcamento;
  total: number;
  cliente: { id: ID; nome: string } | null;
  carro: { id: ID; placa: string; modelo: string } | null;
  contatoNome: string | null;
  contatoTelefone: string | null;
  veiculoDescricao: string | null;
  /** A OS que ele gerou, se já foi aprovado. */
  os: Ref | null;
}

export interface OrcamentoDTO extends Omit<OrcamentoResumoDTO, 'cliente' | 'carro'> {
  /** Concorrência otimista (ADR 0010): mande de volta ao salvar o formulário. */
  versao: number;
  clienteId: ID | null;
  carroId: ID | null;
  cliente: (ContatoDTO & { cpfCnpj: string | null }) | null;
  carro: { id: ID; placa: string; marca: string; modelo: string; ano: number | null; kmAtual: number | null } | null;
  subtotal: number;
  desconto: number;
  observacoes: string | null;
  servicos: ItemServicoDTO[];
  pecas: ItemPecaDTO[];
}

// ---- Ordem de Serviço ------------------------------------------------------

export interface OSResumoDTO {
  id: ID;
  numero: number;
  status: StatusOS;
  dataAbertura: ISODate;
  dataPrevista: ISODate | null;
  dataConclusao: ISODate | null;
  total: number;
  pago: boolean;
  formaPagamento: FormaPagamento | null;
  garantia: boolean;
  cliente: { id: ID; nome: string };
  carro: { id: ID; placa: string; modelo: string };
  mecanico: { id: ID; nome: string } | null;
  /** Passou da previsão de entrega e ainda está na oficina. */
  atrasada: boolean;
}

/** Dinheiro que entrou (ou voltou, no estorno) ligado a esta OS. */
export interface PagamentoOSDTO {
  id: ID;
  data: ISODate;
  tipo: TipoLancamento;
  forma: FormaPagamento | null;
  valor: number;
  descricao: string;
}

export interface OrdemServicoDTO extends Omit<OSResumoDTO, 'cliente' | 'carro'> {
  /** Concorrência otimista (ADR 0010): mande de volta ao salvar o formulário. */
  versao: number;
  cliente: ContatoDTO & { cpfCnpj: string | null };
  carro: {
    id: ID;
    placa: string;
    marca: string;
    modelo: string;
    ano: number | null;
    cor: string | null;
    kmAtual: number | null;
  };
  orcamento: Ref | null;
  /** RN-18: esta OS é garantia DAQUELA. */
  osOrigem: Ref | null;
  /** RN-18: garantias abertas a partir desta. */
  garantias: Ref[];
  kmEntrada: number | null;
  defeitoRelatado: string | null;
  /** Laudo / diagnóstico. */
  observacoes: string | null;
  dataEntrega: ISODate | null;
  canceladaEm: ISODate | null;
  motivoCancelamento: string | null;
  subtotal: number;
  desconto: number;
  servicos: ItemServicoDTO[];
  pecas: ItemPecaDTO[];
  /** Quanto já entrou no caixa por esta OS (líquido de estornos). */
  recebido: number;
  /** Quanto ainda falta receber (parcelas pendentes). */
  aReceber: number;
  pagamentos: PagamentoOSDTO[];
  parcelas: ParcelaDTO[];
}

export interface SituacaoGarantiaDTO {
  elegivel: boolean;
  ehGarantia: boolean;
  garantiaAte: ISODate;
  diasRestantes: number;
  garantiasAbertas: Ref[];
}

export interface AprovacaoDTO {
  os: OSResumoDTO;
  aguardandoPeca: boolean;
}

/** Vai em `detalhes` do erro ESTOQUE_INSUFICIENTE. */
export interface FaltaEstoqueDTO {
  pecaId: ID;
  nome: string;
  unidade: string;
  disponivel: number;
  necessario: number;
}

// ---- Venda de balcão -------------------------------------------------------

export interface VendaResumoDTO {
  id: ID;
  numero: number;
  data: ISODate;
  cliente: { id: ID; nome: string } | null;
  total: number;
  formaPagamento: FormaPagamento;
  qtdItens: number;
  cancelada: boolean;
}

export interface VendaDTO extends VendaResumoDTO {
  subtotal: number;
  desconto: number;
  observacoes: string | null;
  usuario: string | null;
  canceladaEm: ISODate | null;
  motivoCancelamento: string | null;
  itens: ItemPecaDTO[];
}

// ---- Agenda ----------------------------------------------------------------

export interface VisitaDTO {
  /** Concorrência otimista (ADR 0010): mande de volta ao salvar o formulário. */
  versao: number;
  id: ID;
  dataHora: ISODate;
  tipo: TipoVisita;
  status: StatusVisita;
  observacoes: string | null;
  cliente: ContatoDTO;
  carro: { id: ID; placa: string; modelo: string } | null;
}

// ---- Caixa -----------------------------------------------------------------

export interface LancamentoDTO {
  id: ID;
  data: ISODate;
  tipo: TipoLancamento;
  origem: OrigemLancamento;
  descricao: string;
  valor: number;
  formaPagamento: FormaPagamento | null;
  categoria: string | null;
  usuario: string | null;
  os: Ref | null;
}

export interface TotaisCaixaDTO {
  entradas: number;
  saidas: number;
  saldo: number;
}

export interface ListaCaixaDTO extends Pagina<LancamentoDTO> {
  totais: TotaisCaixaDTO;
}

/** RN-15 — fechamento do dia. */
export interface ResumoDiaDTO {
  data: DataISO;
  /** Saldo acumulado até o fim do dia anterior. */
  saldoAnterior: number;
  entradas: number;
  saidas: number;
  /** Saldo anterior + entradas − saídas do dia. */
  saldoFinal: number;
  /** Entradas do dia por forma — o que conferir na gaveta, no PIX e na maquininha. */
  entradasPorForma: Partial<Record<FormaPagamento | 'OUTRA', number>>;
  saidasPorForma: Partial<Record<FormaPagamento | 'OUTRA', number>>;
  lancamentos: LancamentoDTO[];
}

// ---- Despesas --------------------------------------------------------------

export interface DespesaDTO {
  /** Concorrência otimista (ADR 0010): mande de volta ao salvar o formulário. */
  versao: number;
  id: ID;
  data: ISODate;
  categoria: string;
  descricao: string;
  valor: number;
  recorrente: boolean;
  pago: boolean;
  pagoEm: ISODate | null;
  formaPagamento: FormaPagamento | null;
  /** Não paga e com vencimento no passado. */
  vencida: boolean;
  fornecedor: { id: ID; nome: string } | null;
}

export interface ListaDespesasDTO extends Pagina<DespesaDTO> {
  totais: { total: number; pago: number; aPagar: number };
}

// ---- Contas a receber ------------------------------------------------------

export interface ParcelaDTO {
  id: ID;
  parcela: number;
  totalParcelas: number;
  descricao: string | null;
  vencimento: ISODate;
  valor: number;
  valorPago: number;
  saldo: number;
  status: StatusParcela;
  emAtraso: boolean;
  pagoEm: ISODate | null;
  cliente: ContatoDTO;
  os: Ref | null;
}

export interface ListaContasDTO extends Pagina<ParcelaDTO> {
  totais: { pendente: number; emAtraso: number };
}

export interface DevedorDTO {
  cliente: ContatoDTO;
  totalDevido: number;
  emAtraso: number;
  parcelasAbertas: number;
  temAtraso: boolean;
}

export interface ResumoDevedoresDTO {
  totalReceber: number;
  totalEmAtraso: number;
  clientes: DevedorDTO[];
}

// ---- Compras ---------------------------------------------------------------

export interface CompraResumoDTO {
  id: ID;
  numero: number;
  data: ISODate;
  vencimento: ISODate | null;
  numeroNota: string | null;
  valorTotal: number;
  status: StatusCompra;
  pagoEm: ISODate | null;
  fornecedor: { id: ID; nome: string };
  qtdItens: number;
  /** A prazo, com vencimento no passado. */
  vencida: boolean;
}

export interface CompraDTO extends CompraResumoDTO {
  observacoes: string | null;
  formaPagamento: FormaPagamento | null;
  itens: { id: ID; pecaId: ID; nome: string; unidade: string; quantidade: number; custoUnit: number; subtotal: number }[];
}

export interface ListaComprasDTO extends Pagina<CompraResumoDTO> {
  totais: { total: number; aPagar: number; pago: number };
}

export interface ContasAPagarDTO {
  totalAPagar: number;
  totalVencido: number;
  fornecedores: {
    fornecedor: { id: ID; nome: string; telefone: string | null };
    totalDevido: number;
    compras: number;
    compraMaisAntiga: ISODate;
    proximoVencimento: ISODate | null;
  }[];
}

// ---- Alertas (painel do dia) -----------------------------------------------

export interface RevisaoVencidaDTO {
  carroId: ID;
  placa: string;
  marca: string;
  modelo: string;
  kmAtual: number | null;
  cliente: ContatoDTO;
  ultimaOS: { id: ID; numero: number; data: ISODate };
  diasSemServico: number;
}

export interface FiadoAtrasoDTO {
  cliente: ContatoDTO;
  valor: number;
  parcelas: number;
  diasAtraso: number;
}

export interface EstoqueBaixoDTO {
  id: ID;
  nome: string;
  estoqueAtual: number;
  estoqueMinimo: number;
  unidade: string;
  localizacao: string | null;
}

export interface OrcamentoVencendoDTO {
  id: ID;
  numero: number;
  cliente: ContatoDTO | null;
  contatoNome: string | null;
  contatoTelefone: string | null;
  carro: { placa: string; modelo: string } | null;
  validade: ISODate;
  total: number;
  diasRestantes: number;
}

export interface CompraVencendoDTO {
  id: ID;
  numero: number;
  fornecedor: string;
  valorTotal: number;
  vencimento: ISODate;
  diasParaVencer: number;
}

/** Cada lista só vem para quem tem a permissão de agir sobre ela. */
export interface AlertasDTO {
  estoqueBaixo: EstoqueBaixoDTO[];
  osAtrasadas: OSResumoDTO[];
  revisaoVencida: RevisaoVencidaDTO[] | null;
  orcamentosVencendo: OrcamentoVencendoDTO[] | null;
  fiadoEmAtraso: FiadoAtrasoDTO[] | null;
  comprasVencendo: CompraVencendoDTO[] | null;
  total: number;
}

// ---- Relatórios ------------------------------------------------------------

export interface ResumoFinanceiroDTO {
  periodo: { de: DataISO | null; ate: DataISO | null };
  /** Receita da operação: OS, parcelas recebidas e balcão, menos estornos. */
  faturamento: number;
  /** Gastos da oficina (despesas e compras pagas). */
  despesas: number;
  /** RN-13/14: faturamento − despesas. O que sobrou de verdade. */
  lucro: number;
  /** Dinheiro do dono — fora do lucro, mas no caixa. */
  aportes: number;
  retiradas: number;
  estornos: number;
  /** Margem das peças (informativo — no caixa a peça já saiu como compra). */
  receitaPecas: number;
  custoPecasVendidas: number;
  lucroBrutoPecas: number;
  receitaServicos: number;
  vendasBalcao: number;
  /** OS entregues no período (sem garantias e canceladas). */
  numOrdens: number;
  ticketMedio: number;
}

export interface MesEvolucaoDTO {
  /** "2026-09" */
  mes: string;
  faturamento: number;
  despesas: number;
  lucro: number;
  numOrdens: number;
}

export interface ItemRankingDTO {
  nome: string;
  quantidade: number;
  receita: number;
}

export interface RankingsDTO {
  servicosMaisVendidos: ItemRankingDTO[];
  pecasMaisUsadas: ItemRankingDTO[];
  clientesTop: { id: ID; nome: string; ordens: number; total: number }[];
}

export interface PorCategoriaDTO {
  despesasPorCategoria: Record<string, number>;
  entradasPorOrigem: Partial<Record<OrigemLancamento, number>>;
}

export interface ProdutividadeDTO {
  mecanicos: {
    id: ID;
    nome: string;
    comissaoPct: number | null;
    ordens: number;
    receitaServicos: number;
    comissao: number;
    tempoMedioHoras: number | null;
  }[];
}

export interface RelatorioEstoqueDTO {
  valorEstoque: number;
  itensAtivos: number;
  abaixoMinimo: number;
  /** Peças com saldo e sem saída há mais de 90 dias. */
  parados: {
    id: ID;
    nome: string;
    estoqueAtual: number;
    unidade: string;
    valorParado: number;
    ultimaSaida: ISODate | null;
  }[];
}

// ---- Auditoria / backup ----------------------------------------------------

/** Um campo que mudou numa alteração, já formatado: "Preço de venda: R$ 80,00 → R$ 50,00". */
export interface MudancaDTO {
  campo: string;
  de: string;
  para: string;
}

export interface LogAuditoriaDTO {
  id: ID;
  data: ISODate;
  acao: string;
  entidade: string;
  entidadeId: ID | null;
  detalhes: string | null;
  /** O valor anterior e o novo de cada campo alterado (null em registros antigos ou sem retrato). */
  mudancas: MudancaDTO[] | null;
  /** "Aprovou e gerou OS · Orçamento" */
  descricao: string;
  usuario: { id: ID; nome: string; perfil: Perfil } | null;
}

export interface EntidadeAuditadaDTO {
  entidade: string;
  rotulo: string;
  total: number;
}

export interface ArquivoBackupDTO {
  arquivo: string;
  criadoEm: ISODate;
  bytes: number;
}

export interface StatusBackupDTO {
  ativo: boolean;
  /** As cópias saem cifradas (BACKUP_SENHA): abrir exige a senha. */
  criptografado: boolean;
  pasta: string;
  retencaoDias: number;
  ultimo: ArquivoBackupDTO | null;
  atrasado: boolean;
  total: number;
  arquivos: ArquivoBackupDTO[];
}
