import { Prisma } from '@prisma/client';
import {
  LABEL_FORMA_PAGAMENTO,
  LABEL_PERFIL,
  LABEL_STATUS_COMPRA,
  LABEL_STATUS_ORCAMENTO,
  LABEL_STATUS_OS,
  LABEL_STATUS_PARCELA,
  LABEL_STATUS_VISITA,
  LABEL_TIPO_ITEM_ESTOQUE,
  LABEL_TIPO_PESSOA,
  LABEL_TIPO_VISITA,
  brl,
  type MudancaDTO,
} from '@hermes/shared';
import { prisma } from './prisma.js';

// ============================================================
// "Retratos" dos registros, para o histórico mostrar o VALOR
// ANTERIOR: "Preço de venda: R$ 80,00 → R$ 50,00".
//
// O hook de auditoria tira um retrato antes da alteração e outro
// depois, e guarda só o que mudou — já formatado para o Dono ler.
// Uma entrada por entidade, aqui, em vez de código em cada service:
// cobre toda rota que altera um registro com :id, inclusive as que
// ainda vão ser escritas (desde que a entidade esteja na tabela).
// ============================================================

type Formato = (v: unknown) => string;

const vazio = (v: unknown) => v === null || v === undefined || v === '';
const texto: Formato = (v) => (vazio(v) ? '—' : String(v).length > 120 ? `${String(v).slice(0, 120)}…` : String(v));
const dinheiro: Formato = (v) => (vazio(v) ? '—' : brl(Number(v)));
const numero: Formato = (v) => (vazio(v) ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 }));
const pct: Formato = (v) => (vazio(v) ? '—' : `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);
const data: Formato = (v) => (vazio(v) ? '—' : new Date(v as Date).toLocaleDateString('pt-BR'));
const dataHora: Formato = (v) =>
  vazio(v) ? '—' : new Date(v as Date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const simNao: Formato = (v) => (v ? 'sim' : 'não');
const rotulo =
  (mapa: Record<string, string>): Formato =>
  (v) =>
    vazio(v) ? '—' : (mapa[String(v)] ?? String(v));

/**
 * Dado pessoal (contato, documento): o histórico registra QUE mudou, sem o
 * valor. Assim a anonimização da LGPD não deixa o dado vivo no log.
 */
const PESSOAL = 'pessoal' as const;

type Campos = Record<string, [rotulo: string, formato: Formato | typeof PESSOAL]>;

interface Retrato {
  buscar: (id: string) => Promise<Record<string, unknown> | null>;
  campos: Campos;
}

/** Relação trazida com { nome } vira só o nome ("mecanico": { nome: "Zé" } → "Zé"). */
function achatar(obj: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!obj) return null;
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const ehRelacao = v !== null && typeof v === 'object' && !(v instanceof Date) && !Prisma.Decimal.isDecimal(v);
    saida[k] = ehRelacao ? ((v as { nome?: unknown }).nome ?? null) : v;
  }
  return saida;
}

const nome = { select: { nome: true } } as const;

/** Chave: a entidade da rota ("pecas") ou entidade/subitem ("ordens/pecas", com :itemId). */
const RETRATOS: Record<string, Retrato> = {
  clientes: {
    buscar: (id) =>
      prisma.cliente.findUnique({
        where: { id },
        select: { nome: true, tipo: true, cpfCnpj: true, telefone: true, whatsapp: true, email: true, endereco: true, observacoes: true, ativo: true },
      }),
    campos: {
      nome: ['Nome', PESSOAL],
      tipo: ['Tipo', rotulo(LABEL_TIPO_PESSOA)],
      cpfCnpj: ['CPF/CNPJ', PESSOAL],
      telefone: ['Telefone', PESSOAL],
      whatsapp: ['WhatsApp', PESSOAL],
      email: ['E-mail', PESSOAL],
      endereco: ['Endereço', PESSOAL],
      observacoes: ['Observações', PESSOAL],
      ativo: ['Ativo', simNao],
    },
  },
  carros: {
    buscar: async (id) =>
      achatar(
        await prisma.carro.findUnique({
          where: { id },
          select: { placa: true, marca: true, modelo: true, ano: true, cor: true, kmAtual: true, combustivel: true, ativo: true, cliente: nome },
        }),
      ),
    campos: {
      placa: ['Placa', texto],
      marca: ['Marca', texto],
      modelo: ['Modelo', texto],
      ano: ['Ano', texto],
      cor: ['Cor', texto],
      kmAtual: ['KM', numero],
      combustivel: ['Combustível', texto],
      cliente: ['Dono do veículo', PESSOAL],
      ativo: ['Ativo', simNao],
    },
  },
  servicos: {
    buscar: (id) =>
      prisma.servico.findUnique({
        where: { id },
        select: { nome: true, precoMaoDeObra: true, tempoEstimadoMin: true, categoria: true, ativo: true },
      }),
    campos: {
      nome: ['Nome', texto],
      precoMaoDeObra: ['Preço da mão de obra', dinheiro],
      tempoEstimadoMin: ['Tempo estimado (min)', numero],
      categoria: ['Categoria', texto],
      ativo: ['Ativo', simNao],
    },
  },
  pecas: {
    buscar: async (id) =>
      achatar(
        await prisma.peca.findUnique({
          where: { id },
          select: {
            nome: true,
            sku: true,
            codigoBarras: true,
            tipo: true,
            precoCusto: true,
            precoVenda: true,
            margemPct: true,
            estoqueAtual: true,
            estoqueMinimo: true,
            unidade: true,
            localizacao: true,
            ativo: true,
            fornecedor: nome,
          },
        }),
      ),
    campos: {
      nome: ['Nome', texto],
      sku: ['SKU', texto],
      codigoBarras: ['Código de barras', texto],
      tipo: ['Tipo', rotulo(LABEL_TIPO_ITEM_ESTOQUE)],
      precoCusto: ['Custo', dinheiro],
      precoVenda: ['Preço de venda', dinheiro],
      margemPct: ['Margem', pct],
      estoqueAtual: ['Estoque', numero],
      estoqueMinimo: ['Estoque mínimo', numero],
      unidade: ['Unidade', texto],
      localizacao: ['Localização', texto],
      fornecedor: ['Distribuidor', texto],
      ativo: ['Ativo', simNao],
    },
  },
  fornecedores: {
    buscar: (id) =>
      prisma.fornecedor.findUnique({
        where: { id },
        select: { nome: true, cnpj: true, contato: true, telefone: true, email: true, prazoEntrega: true },
      }),
    campos: {
      nome: ['Nome', texto],
      cnpj: ['CNPJ', texto],
      contato: ['Contato', texto],
      telefone: ['Telefone', texto],
      email: ['E-mail', texto],
      prazoEntrega: ['Prazo de entrega (dias)', numero],
    },
  },
  orcamentos: {
    buscar: async (id) =>
      achatar(
        await prisma.orcamento.findUnique({
          where: { id },
          select: { status: true, subtotal: true, desconto: true, total: true, validade: true, contatoNome: true, cliente: nome, carro: { select: { placa: true } } },
        }).then((o) => (o ? { ...o, carro: o.carro?.placa ?? null } : null)),
      ),
    campos: {
      status: ['Situação', rotulo(LABEL_STATUS_ORCAMENTO)],
      subtotal: ['Subtotal', dinheiro],
      desconto: ['Desconto', dinheiro],
      total: ['Total', dinheiro],
      validade: ['Validade', data],
      contatoNome: ['Contato', PESSOAL],
      cliente: ['Cliente', PESSOAL],
      carro: ['Veículo', texto],
    },
  },
  ordens: {
    buscar: async (id) =>
      achatar(
        await prisma.ordemServico.findUnique({
          where: { id },
          select: {
            status: true,
            subtotal: true,
            desconto: true,
            total: true,
            pago: true,
            formaPagamento: true,
            kmEntrada: true,
            dataPrevista: true,
            defeitoRelatado: true,
            observacoes: true,
            motivoCancelamento: true,
            mecanico: nome,
          },
        }),
      ),
    campos: {
      status: ['Situação', rotulo(LABEL_STATUS_OS)],
      subtotal: ['Subtotal', dinheiro],
      desconto: ['Desconto', dinheiro],
      total: ['Total', dinheiro],
      pago: ['Pago', simNao],
      formaPagamento: ['Forma de pagamento', rotulo(LABEL_FORMA_PAGAMENTO)],
      mecanico: ['Mecânico', texto],
      kmEntrada: ['KM de entrada', numero],
      dataPrevista: ['Previsão', dataHora],
      defeitoRelatado: ['Queixa do cliente', texto],
      observacoes: ['Laudo', texto],
      motivoCancelamento: ['Motivo do cancelamento', texto],
    },
  },
  'ordens/servicos': {
    buscar: async (id) =>
      achatar(await prisma.oSServico.findUnique({ where: { id }, select: { quantidade: true, precoUnit: true, concluido: true, servico: nome } })),
    campos: {
      servico: ['Serviço', texto],
      quantidade: ['Quantidade', numero],
      precoUnit: ['Preço', dinheiro],
      concluido: ['Feito', simNao],
    },
  },
  'ordens/pecas': {
    buscar: async (id) =>
      achatar(await prisma.oSPeca.findUnique({ where: { id }, select: { quantidade: true, precoUnit: true, peca: nome } })),
    campos: {
      peca: ['Peça', texto],
      quantidade: ['Quantidade', numero],
      precoUnit: ['Preço', dinheiro],
    },
  },
  vendas: {
    buscar: (id) =>
      prisma.venda.findUnique({ where: { id }, select: { total: true, desconto: true, formaPagamento: true, canceladaEm: true, motivoCancelamento: true } }),
    campos: {
      total: ['Total', dinheiro],
      desconto: ['Desconto', dinheiro],
      formaPagamento: ['Forma de pagamento', rotulo(LABEL_FORMA_PAGAMENTO)],
      canceladaEm: ['Cancelada em', dataHora],
      motivoCancelamento: ['Motivo do cancelamento', texto],
    },
  },
  agenda: {
    buscar: (id) =>
      prisma.visita.findUnique({ where: { id }, select: { dataHora: true, tipo: true, status: true, observacoes: true } }),
    campos: {
      dataHora: ['Horário', dataHora],
      tipo: ['Tipo', rotulo(LABEL_TIPO_VISITA)],
      status: ['Situação', rotulo(LABEL_STATUS_VISITA)],
      observacoes: ['Observações', texto],
    },
  },
  despesas: {
    buscar: (id) =>
      prisma.despesa.findUnique({
        where: { id },
        select: { data: true, categoria: true, descricao: true, valor: true, pago: true, formaPagamento: true },
      }),
    campos: {
      descricao: ['Descrição', texto],
      categoria: ['Categoria', texto],
      valor: ['Valor', dinheiro],
      data: ['Vencimento', data],
      pago: ['Paga', simNao],
      formaPagamento: ['Forma de pagamento', rotulo(LABEL_FORMA_PAGAMENTO)],
    },
  },
  'contas-receber': {
    buscar: (id) =>
      prisma.contaReceber.findUnique({ where: { id }, select: { valor: true, valorPago: true, status: true, vencimento: true } }),
    campos: {
      valor: ['Valor', dinheiro],
      valorPago: ['Já recebido', dinheiro],
      status: ['Situação', rotulo(LABEL_STATUS_PARCELA)],
      vencimento: ['Vencimento', data],
    },
  },
  compras: {
    buscar: (id) =>
      prisma.compra.findUnique({ where: { id }, select: { valorTotal: true, status: true, vencimento: true, formaPagamento: true } }),
    campos: {
      valorTotal: ['Valor', dinheiro],
      status: ['Situação', rotulo(LABEL_STATUS_COMPRA)],
      vencimento: ['Vencimento', data],
      formaPagamento: ['Forma de pagamento', rotulo(LABEL_FORMA_PAGAMENTO)],
    },
  },
  usuarios: {
    // Nunca o hash da senha: trocar senha não aparece como "mudança de valor".
    buscar: (id) =>
      prisma.usuario.findUnique({ where: { id }, select: { nome: true, email: true, perfil: true, ativo: true, comissaoPct: true } }),
    campos: {
      nome: ['Nome', texto],
      email: ['E-mail', texto],
      perfil: ['Perfil', rotulo(LABEL_PERFIL)],
      ativo: ['Ativo', simNao],
      comissaoPct: ['Comissão', pct],
    },
  },
  oficina: {
    buscar: () =>
      prisma.oficina.findUnique({
        where: { id: 'unica' },
        select: {
          nome: true,
          subtitulo: true,
          cnpj: true,
          telefone: true,
          email: true,
          endereco: true,
          logo: true,
          observacoesDocumento: true,
          margemPadrao: true,
          descontoMaxSemSenha: true,
          garantiaDias: true,
          validadeOrcamentoDias: true,
        },
      }),
    campos: {
      nome: ['Nome da oficina', texto],
      subtitulo: ['Subtítulo', texto],
      cnpj: ['CNPJ', texto],
      telefone: ['Telefone', texto],
      email: ['E-mail', texto],
      endereco: ['Endereço', texto],
      logo: ['Logo', (v) => (vazio(v) ? 'sem logo' : 'com logo')],
      observacoesDocumento: ['Rodapé dos documentos', texto],
      margemPadrao: ['Margem padrão', pct],
      descontoMaxSemSenha: ['Desconto sem senha do Dono', pct],
      garantiaDias: ['Garantia (dias)', numero],
      validadeOrcamentoDias: ['Validade do orçamento (dias)', numero],
    },
  },
};

export interface AlvoDoRetrato {
  chave: string;
  id: string;
}

/**
 * Qual registro a rota altera: `:itemId` de um subitem (ordens/pecas),
 * a configuração única da oficina, ou o `:id` da entidade.
 * Rota sem alvo reconhecível (criação, acerto, sessões): sem retrato.
 */
export function alvoDaRota(rota: string, params: Record<string, string>): AlvoDoRetrato | null {
  const partes = rota.replace(/^\/api\//, '').split('/');
  const entidade = partes[0];
  if (params.itemId) {
    const chave = `${entidade}/${partes[2]}`;
    return RETRATOS[chave] ? { chave, id: params.itemId } : null;
  }
  if (entidade === 'oficina') return { chave: 'oficina', id: 'unica' };
  return params.id && RETRATOS[entidade] ? { chave: entidade, id: params.id } : null;
}

export function tirarRetrato(alvo: AlvoDoRetrato): Promise<Record<string, unknown> | null> {
  return RETRATOS[alvo.chave].buscar(alvo.id);
}

/**
 * O que mudou entre os dois retratos, campo a campo, já formatado.
 * Registro que sumiu (excluído): o que ele tinha, "para" vazio.
 */
export function compararRetratos(
  chave: string,
  antes: Record<string, unknown> | null,
  depois: Record<string, unknown> | null,
): MudancaDTO[] {
  if (!antes) return [];
  const mudancas: MudancaDTO[] = [];
  for (const [campo, [nomeDoCampo, formato]] of Object.entries(RETRATOS[chave].campos)) {
    const valorAntes = antes[campo];
    const valorDepois = depois ? depois[campo] : null;
    if (formato === PESSOAL) {
      // Só compara; o valor não vai para o log.
      if (String(valorAntes ?? '') !== String(valorDepois ?? '')) {
        mudancas.push({ campo: nomeDoCampo, de: '(dado pessoal)', para: depois ? '(alterado)' : '—' });
      }
      continue;
    }
    const de = formato(valorAntes);
    const para = depois ? formato(valorDepois) : '—';
    if (de !== para && !(depois === null && de === '—')) mudancas.push({ campo: nomeDoCampo, de, para });
  }
  return mudancas;
}
