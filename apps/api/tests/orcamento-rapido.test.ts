import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { orcamentoSchema } from '@hermes/shared/schemas';
import { db, limparDominio, configPadrao, cenarioBase, atores, type Base } from './ajuda.js';
import * as orcamentos from '../src/modules/orcamentos/orcamentos.service.js';

// ============================================================
// ORÇAMENTO RÁPIDO — dizer um preço sem exigir dois cadastros.
//
// Antes, para responder "quanto custa trocar o óleo?" era preciso cadastrar o
// cliente E o veículo (com placa obrigatória) antes de chegar no valor. Quem
// ligava perguntando preço, sem a placa na mão, travava o atendimento.
// ============================================================

let a: Awaited<ReturnType<typeof atores>>;

/** Orçamento rápido: nenhum cadastro, só identificação solta e opcional. */
function rapido(base: Base, contato: { nome?: string; telefone?: string; veiculo?: string } = {}, desconto = 0) {
  return orcamentos.criar(
    {
      contatoNome: contato.nome,
      contatoTelefone: contato.telefone,
      veiculoDescricao: contato.veiculo,
      desconto,
      servicos: [{ servicoId: base.servico.id, quantidade: 1 }],
      pecas: [],
    },
    a.atendente,
  );
}

const aprovar = (id: string, ident: { clienteId?: string; carroId?: string } = {}) =>
  orcamentos.aprovar(id, { confirmarSemEstoque: false, ...ident }, a.atendente);

beforeAll(async () => {
  a = await atores();
});
beforeEach(async () => {
  await limparDominio();
  await configPadrao();
});
afterAll(async () => {
  await db.$disconnect();
});

describe('criar sem cadastro nenhum', () => {
  it('nasce sem cliente e sem veículo, e já tem preço', async () => {
    const base = await cenarioBase({ precoServico: 120 });
    const orc = await rapido(base);
    expect(orc.clienteId).toBeNull();
    expect(orc.carroId).toBeNull();
    expect(orc.total).toBe(120);
    expect(orc.status).toBe('RASCUNHO');
  });

  it('guarda a identificação solta para saber de quem era', async () => {
    const base = await cenarioBase();
    const orc = await rapido(base, { nome: 'João', telefone: '11999990000', veiculo: 'Gol 2015' });
    expect(orc.contatoNome).toBe('João');
    expect(orc.contatoTelefone).toBe('11999990000');
    expect(orc.veiculoDescricao).toBe('Gol 2015');
  });

  it('nem a identificação é obrigatória — só o item', async () => {
    const base = await cenarioBase();
    const orc = await rapido(base);
    expect(orc.contatoNome).toBeNull();
    expect(orc.id).toBeTruthy();
  });

  // A regra vivia só no schema de entrada; este teste a encontrou aceitando um
  // orçamento vazio quando o service era chamado direto. Guarda agora nos dois.
  it('continua exigindo ao menos 1 serviço ou peça (RN-10)', async () => {
    await cenarioBase();
    await expect(orcamentos.criar({ desconto: 0, servicos: [], pecas: [] }, a.atendente)).rejects.toThrow(
      /ao menos 1 serviço ou peça/i,
    );
  });

  it('dá para achar depois pelo nome, telefone ou veículo', async () => {
    const base = await cenarioBase();
    await rapido(base, { nome: 'Maria Silva', telefone: '11988887777', veiculo: 'Palio 2012' });
    for (const termo of ['Maria', '88887777', 'Palio']) {
      const achados = await orcamentos.listar({ pagina: 1, porPagina: 25, busca: termo });
      expect(achados.itens, `busca por "${termo}"`).toHaveLength(1);
    }
  });
});

describe('o completo segue exigindo o cadastro', () => {
  it('veículo sem cliente é recusado pelo contrato de entrada', async () => {
    const base = await cenarioBase();
    const r = orcamentoSchema.safeParse({ carroId: base.carro.id, servicos: [{ servicoId: base.servico.id }], pecas: [] });
    expect(r.success).toBe(false);
  });

  it('veículo de outro dono é recusado', async () => {
    const x = await cenarioBase();
    const y = await cenarioBase();
    await expect(
      orcamentos.criar(
        { clienteId: x.cliente.id, carroId: y.carro.id, desconto: 0, servicos: [{ servicoId: x.servico.id, quantidade: 1 }], pecas: [] },
        a.atendente,
      ),
    ).rejects.toThrow(/não pertence a esse cliente/i);
  });
});

describe('virar Ordem de Serviço', () => {
  it('sem cadastro é barrado, com código para a tela reagir', async () => {
    const base = await cenarioBase();
    const orc = await rapido(base);
    await expect(aprovar(orc.id)).rejects.toMatchObject({ statusCode: 400, codigo: 'CADASTRO_NECESSARIO' });
    expect(await db.ordemServico.count()).toBe(0);
  });

  it('informando cliente e veículo na hora, gera a OS', async () => {
    const base = await cenarioBase();
    const orc = await rapido(base, { nome: 'João' });
    const { os } = await aprovar(orc.id, { clienteId: base.cliente.id, carroId: base.carro.id });
    expect(os.cliente.id).toBe(base.cliente.id);
    expect(os.carro.id).toBe(base.carro.id);
    expect(os.total).toBe(orc.total);
  });

  it('aprovar também identifica o orçamento e limpa o contato solto', async () => {
    const base = await cenarioBase();
    const orc = await rapido(base, { nome: 'João', telefone: '11999990000', veiculo: 'Gol' });
    await aprovar(orc.id, { clienteId: base.cliente.id, carroId: base.carro.id });

    const depois = await db.orcamento.findUniqueOrThrow({ where: { id: orc.id } });
    expect(depois.status).toBe('APROVADO');
    expect(depois.clienteId).toBe(base.cliente.id);
    // Sem isto o orçamento ficaria "sem dono" para sempre, com uma OS pendurada.
    expect(depois.contatoNome).toBeNull();
    expect(depois.veiculoDescricao).toBeNull();
  });

  it('não aceita veículo de outro cliente na aprovação', async () => {
    const x = await cenarioBase();
    const y = await cenarioBase();
    const orc = await rapido(x);
    await expect(aprovar(orc.id, { clienteId: x.cliente.id, carroId: y.carro.id })).rejects.toThrow(/não pertence a esse cliente/i);
    expect(await db.ordemServico.count()).toBe(0);
  });
});

describe('identificar sem aprovar', () => {
  it('vira completo mantendo os itens e o valor', async () => {
    const base = await cenarioBase({ precoServico: 250 });
    const orc = await rapido(base, { nome: 'João', telefone: '11999990000', veiculo: 'Gol' });
    const pronto = await orcamentos.identificar(orc.id, base.cliente.id, base.carro.id);

    expect(pronto.clienteId).toBe(base.cliente.id);
    expect(pronto.carroId).toBe(base.carro.id);
    expect(pronto.total).toBe(250);
    expect(pronto.servicos).toHaveLength(1);
    expect(pronto.contatoNome).toBeNull();
    // Continua valendo: identificar não aprova nem gera OS.
    expect(pronto.status).toBe('RASCUNHO');
    expect(await db.ordemServico.count()).toBe(0);
  });

  it('recusa identificar duas vezes', async () => {
    const base = await cenarioBase();
    const orc = await rapido(base);
    await orcamentos.identificar(orc.id, base.cliente.id, base.carro.id);
    await expect(orcamentos.identificar(orc.id, base.cliente.id, base.carro.id)).rejects.toThrow(/já está identificado/i);
  });

  it('recusa veículo de outro dono', async () => {
    const x = await cenarioBase();
    const y = await cenarioBase();
    const orc = await rapido(x);
    await expect(orcamentos.identificar(orc.id, x.cliente.id, y.carro.id)).rejects.toThrow(/não pertence a esse cliente/i);
  });
});

describe('o rápido não escapa das outras regras', () => {
  it('expira sozinho como qualquer orçamento (RN-06)', async () => {
    const base = await cenarioBase();
    const orc = await rapido(base);
    await db.orcamento.update({ where: { id: orc.id }, data: { validade: new Date(Date.now() - 1000) } });
    const lista = await orcamentos.listar({ pagina: 1, porPagina: 25 });
    expect(lista.itens.find((o) => o.id === orc.id)?.status).toBe('EXPIRADO');
  });

  it('respeita o teto de desconto (RN-08)', async () => {
    const base = await cenarioBase({ precoServico: 100 });
    // 50% sobre 100, muito acima do teto de 10%
    await expect(rapido(base, { nome: 'João' }, 50)).rejects.toMatchObject({ codigo: 'SENHA_DONO_NECESSARIA' });
  });
});
