import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db, limparDominio, configPadrao, cenarioBase } from './ajuda.js';
import * as orcamentos from '../src/modules/orcamentos/orcamentos.service.js';

// ============================================================
// ORÇAMENTO RÁPIDO — dizer um preço sem exigir dois cadastros.
//
// Antes, para responder "quanto custa trocar o óleo?" era preciso cadastrar o
// cliente E o veículo (com placa obrigatória) antes de chegar no valor. Quem
// ligava perguntando preço, sem a placa na mão, travava o atendimento.
// ============================================================

type Base = Awaited<ReturnType<typeof cenarioBase>>;

/** Orçamento rápido: nenhum cadastro, só identificação solta e opcional. */
function rapido(base: Base, contato: { nome?: string; telefone?: string; veiculo?: string } = {}) {
  return orcamentos.createOrcamento({
    clienteId: undefined,
    carroId: undefined,
    contatoNome: contato.nome,
    contatoTelefone: contato.telefone,
    veiculoDescricao: contato.veiculo,
    validadeDias: 15,
    desconto: 0,
    observacoes: undefined,
    servicos: [{ servicoId: base.servico.id, quantidade: 1 }],
    pecas: [],
  });
}

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
    await expect(
      orcamentos.createOrcamento({
        clienteId: undefined,
        carroId: undefined,
        validadeDias: 15,
        desconto: 0,
        observacoes: undefined,
        servicos: [],
        pecas: [],
      } as never),
    ).rejects.toThrow(/ao menos 1 serviço ou peça/i);
  });

  it('dá para achar depois pelo nome, telefone ou veículo', async () => {
    const base = await cenarioBase();
    await rapido(base, { nome: 'Maria Silva', telefone: '11988887777', veiculo: 'Palio 2012' });

    for (const termo of ['Maria', '88887777', 'Palio']) {
      const achados = await orcamentos.listOrcamentos(termo);
      expect(achados, `busca por "${termo}"`).toHaveLength(1);
    }
  });
});

describe('o completo segue exigindo o cadastro', () => {
  it('veículo sem cliente é recusado pelo contrato de entrada', async () => {
    const base = await cenarioBase();
    const { createOrcamentoSchema } = await import('../src/modules/orcamentos/orcamentos.schema.js');

    const r = createOrcamentoSchema.safeParse({
      carroId: base.carro.id,
      servicos: [{ servicoId: base.servico.id, quantidade: 1 }],
      pecas: [],
    });
    expect(r.success).toBe(false);
  });

  it('veículo de outro dono é recusado', async () => {
    const a = await cenarioBase();
    const b = await cenarioBase();

    await expect(
      orcamentos.createOrcamento({
        clienteId: a.cliente.id,
        carroId: b.carro.id, // carro do outro cliente
        validadeDias: 15,
        desconto: 0,
        observacoes: undefined,
        servicos: [{ servicoId: a.servico.id, quantidade: 1 }],
        pecas: [],
      }),
    ).rejects.toThrow(/não pertence a esse cliente/i);
  });
});

describe('virar Ordem de Serviço', () => {
  it('sem cadastro é barrado, com código para a tela reagir', async () => {
    const base = await cenarioBase();
    const orc = await rapido(base);

    await expect(orcamentos.aprovarParaOS(orc.id)).rejects.toMatchObject({
      statusCode: 400,
      codigo: 'CADASTRO_NECESSARIO',
    });
    expect(await db.ordemServico.count()).toBe(0);
  });

  it('informando cliente e veículo na hora, gera a OS', async () => {
    const base = await cenarioBase();
    const orc = await rapido(base, { nome: 'João' });

    const { os } = await orcamentos.aprovarParaOS(orc.id, undefined, {
      clienteId: base.cliente.id,
      carroId: base.carro.id,
    });

    expect(os.clienteId).toBe(base.cliente.id);
    expect(os.carroId).toBe(base.carro.id);
    expect(os.total).toBe(orc.total);
  });

  it('aprovar também identifica o orçamento e limpa o contato solto', async () => {
    const base = await cenarioBase();
    const orc = await rapido(base, { nome: 'João', telefone: '11999990000', veiculo: 'Gol' });

    await orcamentos.aprovarParaOS(orc.id, undefined, { clienteId: base.cliente.id, carroId: base.carro.id });

    const depois = await db.orcamento.findUniqueOrThrow({ where: { id: orc.id } });
    expect(depois.status).toBe('APROVADO');
    expect(depois.clienteId).toBe(base.cliente.id);
    // Sem isto o orçamento ficaria "sem dono" para sempre, com uma OS pendurada.
    expect(depois.contatoNome).toBeNull();
    expect(depois.veiculoDescricao).toBeNull();
  });

  it('não aceita veículo de outro cliente na aprovação', async () => {
    const a = await cenarioBase();
    const b = await cenarioBase();
    const orc = await rapido(a);

    await expect(
      orcamentos.aprovarParaOS(orc.id, undefined, { clienteId: a.cliente.id, carroId: b.carro.id }),
    ).rejects.toThrow(/não pertence a esse cliente/i);
    expect(await db.ordemServico.count()).toBe(0);
  });
});

describe('identificar sem aprovar', () => {
  it('vira completo mantendo os itens e o valor', async () => {
    const base = await cenarioBase({ precoServico: 250 });
    const orc = await rapido(base, { nome: 'João', telefone: '11999990000', veiculo: 'Gol' });

    const pronto = await orcamentos.identificarOrcamento(orc.id, base.cliente.id, base.carro.id);

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
    await orcamentos.identificarOrcamento(orc.id, base.cliente.id, base.carro.id);

    await expect(orcamentos.identificarOrcamento(orc.id, base.cliente.id, base.carro.id)).rejects.toThrow(
      /já está identificado/i,
    );
  });

  it('recusa veículo de outro dono', async () => {
    const a = await cenarioBase();
    const b = await cenarioBase();
    const orc = await rapido(a);

    await expect(orcamentos.identificarOrcamento(orc.id, a.cliente.id, b.carro.id)).rejects.toThrow(
      /não pertence a esse cliente/i,
    );
  });
});

describe('o rápido não escapa das outras regras', () => {
  it('expira sozinho como qualquer orçamento (RN-06)', async () => {
    const base = await cenarioBase();
    const orc = await rapido(base);
    await db.orcamento.update({ where: { id: orc.id }, data: { validade: new Date(Date.now() - 1000) } });

    const lista = await orcamentos.listOrcamentos();
    expect(lista.find((o) => o.id === orc.id)?.status).toBe('EXPIRADO');
  });

  it('respeita o teto de desconto (RN-08)', async () => {
    const base = await cenarioBase({ precoServico: 100 });
    await expect(
      orcamentos.createOrcamento({
        clienteId: undefined,
        carroId: undefined,
        contatoNome: 'João',
        validadeDias: 15,
        desconto: 50, // 50% sobre 100, muito acima do teto de 10%
        observacoes: undefined,
        servicos: [{ servicoId: base.servico.id, quantidade: 1 }],
        pecas: [],
      }),
    ).rejects.toMatchObject({ codigo: 'SENHA_DONO_NECESSARIA' });
  });
});
