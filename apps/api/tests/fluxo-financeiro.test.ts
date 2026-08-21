import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { db, limparDominio, configPadrao, cenarioBase, donoDeTeste } from './ajuda.js';
import * as orcamentos from '../src/modules/orcamentos/orcamentos.service.js';
import * as ordens from '../src/modules/ordens/ordens.service.js';
import * as relatorios from '../src/modules/relatorios/relatorios.service.js';

// ============================================================
// O caminho do dinheiro: orçamento → OS → estoque → caixa.
// É o núcleo do sistema e onde um erro custa caro de verdade,
// porque some sem ninguém perceber até o fim do mês.
// ============================================================

const SENHA_DONO = 'senha-do-dono';
const aVista = { formaPagamento: 'PIX' as const, parcelas: 1, primeiroVencimentoDias: 30, liberarFiado: false };

type Base = Awaited<ReturnType<typeof cenarioBase>>;

async function novoOrcamento(
  base: Base,
  over: { qtdPeca?: number; desconto?: number; senhaDono?: string; validadeDias?: number } = {},
) {
  return orcamentos.createOrcamento({
    clienteId: base.cliente.id,
    carroId: base.carro.id,
    validadeDias: over.validadeDias ?? 15,
    desconto: over.desconto ?? 0,
    senhaDono: over.senhaDono,
    observacoes: undefined,
    servicos: [{ servicoId: base.servico.id, quantidade: 1 }],
    pecas: [{ pecaId: base.peca.id, quantidade: over.qtdPeca ?? 2 }],
  });
}

/** Leva um orçamento até a OS concluída, pronta para receber pagamento. */
async function ateConcluir(base: Base, over: { qtdPeca?: number } = {}) {
  const orc = await novoOrcamento(base, over);
  const { os } = await orcamentos.aprovarParaOS(orc.id);
  await ordens.mudarStatus(os.id, 'EM_EXECUCAO');
  await ordens.mudarStatus(os.id, 'CONCLUIDA');
  return os;
}

beforeAll(async () => {
  await donoDeTeste(SENHA_DONO);
});
beforeEach(async () => {
  await limparDominio();
  await configPadrao();
});
afterAll(async () => {
  await db.$disconnect();
});

describe('RN-09 — o total fecha', () => {
  it('soma mão de obra + peças e desconta', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    // 30 sobre 200 é 15% e passa do teto de 10% (RN-08) — por isso a senha vai junto.
    const orc = await novoOrcamento(base, { qtdPeca: 2, desconto: 30, senhaDono: SENHA_DONO });

    expect(orc.subtotal).toBe(200); // 100 de serviço + 2 x 50 de peça
    expect(orc.desconto).toBe(30);
    expect(orc.total).toBe(170);
  });

  it('não deixa o desconto passar do subtotal (total nunca fica negativo)', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const orc = await novoOrcamento(base, { qtdPeca: 1, desconto: 9999, senhaDono: SENHA_DONO });

    expect(orc.desconto).toBe(orc.subtotal);
    expect(orc.total).toBe(0);
  });
});

describe('RN-07 e RN-01 — aprovar gera OS e baixa o estoque', () => {
  it('copia os itens, baixa a peça e registra o movimento', async () => {
    const base = await cenarioBase({ estoque: 10 });
    const orc = await novoOrcamento(base, { qtdPeca: 3 });

    const { os, aguardandoPeca } = await orcamentos.aprovarParaOS(orc.id);

    expect(aguardandoPeca).toBe(false);
    expect(os.status).toBe('ABERTA');
    expect(os.servicos).toHaveLength(1);
    expect(os.pecas).toHaveLength(1);
    expect(os.total).toBe(orc.total);

    // RN-01: o estoque baixou exatamente o que a OS consumiu.
    const peca = await db.peca.findUniqueOrThrow({ where: { id: base.peca.id } });
    expect(peca.estoqueAtual).toBe(7);

    const mov = await db.movimentoEstoque.findMany({ where: { pecaId: base.peca.id } });
    expect(mov).toHaveLength(1);
    expect(mov[0].tipo).toBe('SAIDA');
    expect(mov[0].quantidade).toBe(3);

    const atualizado = await db.orcamento.findUniqueOrThrow({ where: { id: orc.id } });
    expect(atualizado.status).toBe('APROVADO');
  });

  it('RN-03 — sem estoque suficiente, a OS nasce aguardando peça', async () => {
    const base = await cenarioBase({ estoque: 1 });
    const orc = await novoOrcamento(base, { qtdPeca: 5 });

    const { os, aguardandoPeca } = await orcamentos.aprovarParaOS(orc.id);

    expect(aguardandoPeca).toBe(true);
    expect(os.status).toBe('AGUARDANDO_PECA');
  });

  it('não aprova o mesmo orçamento duas vezes (não baixa estoque em dobro)', async () => {
    const base = await cenarioBase({ estoque: 10 });
    const orc = await novoOrcamento(base, { qtdPeca: 3 });
    await orcamentos.aprovarParaOS(orc.id);

    await expect(orcamentos.aprovarParaOS(orc.id)).rejects.toThrow(/já virou uma Ordem de Serviço/i);

    const peca = await db.peca.findUniqueOrThrow({ where: { id: base.peca.id } });
    expect(peca.estoqueAtual).toBe(7); // continua 7, não 4
  });
});

describe('RN-06 — orçamento vence sozinho', () => {
  it('marca como EXPIRADO na leitura e recusa virar OS', async () => {
    const base = await cenarioBase();
    const orc = await novoOrcamento(base);

    // Envelhece a validade direto no banco (o serviço sempre olha a data de hoje).
    await db.orcamento.update({ where: { id: orc.id }, data: { validade: new Date(Date.now() - 1000) } });

    const lista = await orcamentos.listOrcamentos();
    expect(lista.find((o) => o.id === orc.id)?.status).toBe('EXPIRADO');

    await expect(orcamentos.aprovarParaOS(orc.id)).rejects.toThrow(/expirado/i);
  });

  it('orçamento aprovado não expira', async () => {
    const base = await cenarioBase();
    const orc = await novoOrcamento(base);
    await orcamentos.aprovarParaOS(orc.id);
    await db.orcamento.update({ where: { id: orc.id }, data: { validade: new Date(Date.now() - 1000) } });

    await orcamentos.listOrcamentos();

    const depois = await db.orcamento.findUniqueOrThrow({ where: { id: orc.id } });
    expect(depois.status).toBe('APROVADO');
  });
});

describe('RN-08 — teto de desconto', () => {
  it('desconto dentro do teto passa sem senha', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const orc = await novoOrcamento(base, { qtdPeca: 2, desconto: 20 }); // 10% de 200
    expect(orc.desconto).toBe(20);
  });

  it('acima do teto sem senha é recusado', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    await expect(novoOrcamento(base, { qtdPeca: 2, desconto: 60 })).rejects.toMatchObject({
      statusCode: 403,
      codigo: 'SENHA_DONO_NECESSARIA',
    });
  });

  it('acima do teto com senha errada é recusado', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    await expect(novoOrcamento(base, { qtdPeca: 2, desconto: 60, senhaDono: 'chute' })).rejects.toMatchObject({
      statusCode: 403,
      codigo: 'SENHA_DONO_INCORRETA',
    });
  });

  it('acima do teto com a senha do Dono passa', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const orc = await novoOrcamento(base, { qtdPeca: 2, desconto: 60, senhaDono: SENHA_DONO });
    expect(orc.total).toBe(140);
  });

  it('o teto vem da configuração, não do código', async () => {
    await configPadrao({ descontoMaxSemSenha: 50 });
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const orc = await novoOrcamento(base, { qtdPeca: 2, desconto: 60 }); // 30%, agora liberado
    expect(orc.desconto).toBe(60);
  });
});

describe('RN-11 — pagamento vira dinheiro no caixa', () => {
  it('RN-10 — não conclui OS sem serviço nem peça', async () => {
    const base = await cenarioBase();
    const vazia = await db.ordemServico.create({
      data: { clienteId: base.cliente.id, carroId: base.carro.id, total: 0 },
    });
    await ordens.mudarStatus(vazia.id, 'EM_EXECUCAO');
    await expect(ordens.mudarStatus(vazia.id, 'CONCLUIDA')).rejects.toThrow(/ao menos 1 serviço ou peça/i);
  });

  it('à vista gera a entrada no livro-caixa e entrega a OS', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const os = await ateConcluir(base, { qtdPeca: 2 });
    const dono = await donoDeTeste(SENHA_DONO);

    const r = await ordens.receberPagamento(os.id, aVista, dono.id);

    expect(r.aVista).toBe(true);
    expect(r.os.pago).toBe(true);
    expect(r.os.status).toBe('ENTREGUE');

    const lancamentos = await db.lancamentoCaixa.findMany({ where: { osId: os.id } });
    expect(lancamentos).toHaveLength(1);
    expect(lancamentos[0].tipo).toBe('ENTRADA');
    expect(Number(lancamentos[0].valor)).toBe(200);
    expect(await db.contaReceber.count()).toBe(0);
  });

  it('não recebe duas vezes a mesma OS', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const os = await ateConcluir(base, { qtdPeca: 2 });
    const dono = await donoDeTeste(SENHA_DONO);

    await ordens.receberPagamento(os.id, aVista, dono.id);
    await expect(ordens.receberPagamento(os.id, aVista, dono.id)).rejects.toThrow(/já está paga/i);

    expect(await db.lancamentoCaixa.count({ where: { osId: os.id } })).toBe(1);
  });

  it('não recebe OS que ainda não foi concluída', async () => {
    const base = await cenarioBase();
    const orc = await novoOrcamento(base);
    const { os } = await orcamentos.aprovarParaOS(orc.id);
    const dono = await donoDeTeste(SENHA_DONO);

    await expect(ordens.receberPagamento(os.id, aVista, dono.id)).rejects.toThrow(/Conclua a OS/i);
  });

  it('RN-11.1 — parcelado cria as parcelas e NÃO entra no caixa ainda', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const os = await ateConcluir(base, { qtdPeca: 2 });
    const dono = await donoDeTeste(SENHA_DONO);

    const r = await ordens.receberPagamento(
      os.id,
      { formaPagamento: 'PARCELADO', parcelas: 3, primeiroVencimentoDias: 30, liberarFiado: false },
      dono.id,
    );

    expect(r.aVista).toBe(false);
    expect(r.parcelas).toBe(3);

    const parcelas = await db.contaReceber.findMany({ where: { osId: os.id }, orderBy: { parcela: 'asc' } });
    expect(parcelas).toHaveLength(3);
    // As parcelas somam exatamente o total: o resto da divisão vai na última.
    expect(parcelas.reduce((s, p) => s + Number(p.valor), 0)).toBe(200);
    expect(parcelas.every((p) => p.status === 'PENDENTE')).toBe(true);

    // Regime de caixa: nada entrou ainda.
    expect(await db.lancamentoCaixa.count({ where: { osId: os.id } })).toBe(0);
  });

  it('parcela quebrada não perde nem inventa centavo', async () => {
    const base = await cenarioBase({ precoServico: 100 });
    const orc = await orcamentos.createOrcamento({
      clienteId: base.cliente.id,
      carroId: base.carro.id,
      validadeDias: 15,
      desconto: 0,
      observacoes: undefined,
      servicos: [{ servicoId: base.servico.id, quantidade: 1 }],
      pecas: [],
    });
    const { os } = await orcamentos.aprovarParaOS(orc.id);
    await ordens.mudarStatus(os.id, 'EM_EXECUCAO');
    await ordens.mudarStatus(os.id, 'CONCLUIDA');
    const dono = await donoDeTeste(SENHA_DONO);

    // 100 / 3 = 33,333... — o teste existe justamente por causa disso.
    await ordens.receberPagamento(
      os.id,
      { formaPagamento: 'FIADO', parcelas: 3, primeiroVencimentoDias: 30, liberarFiado: false },
      dono.id,
    );

    const parcelas = await db.contaReceber.findMany({ where: { osId: os.id } });
    expect(parcelas.reduce((s, p) => s + Number(p.valor), 0)).toBe(100);
  });
});

describe('RN-11.2 — fiado em atraso trava novo fiado', () => {
  async function comDividaVencida() {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    await db.contaReceber.create({
      data: {
        clienteId: base.cliente.id,
        parcela: 1,
        totalParcelas: 1,
        valor: 300,
        vencimento: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        status: 'PENDENTE',
      },
    });
    const os = await ateConcluir(base, { qtdPeca: 2 });
    return { base, os, dono: await donoDeTeste(SENHA_DONO) };
  }

  it('barra o fiado de quem tem parcela vencida', async () => {
    const { os, dono } = await comDividaVencida();
    await expect(
      ordens.receberPagamento(
        os.id,
        { formaPagamento: 'FIADO', parcelas: 2, primeiroVencimentoDias: 30, liberarFiado: false },
        dono.id,
      ),
    ).rejects.toThrow(/vencida/i);
  });

  it('à vista nunca é barrado — quitar sempre pode', async () => {
    const { os, dono } = await comDividaVencida();
    const r = await ordens.receberPagamento(
      os.id,
      { formaPagamento: 'A_VISTA', parcelas: 1, primeiroVencimentoDias: 30, liberarFiado: false },
      dono.id,
    );
    expect(r.os.pago).toBe(true);
  });

  it('liberar assumindo o risco deixa passar', async () => {
    const { os, dono } = await comDividaVencida();
    const r = await ordens.receberPagamento(
      os.id,
      { formaPagamento: 'FIADO', parcelas: 2, primeiroVencimentoDias: 30, liberarFiado: true },
      dono.id,
    );
    expect(r.parcelas).toBe(2);
  });
});

describe('RN-13 e RN-14 — lucro não é faturamento', () => {
  /**
   * ATENÇÃO à diferença entre o código e o texto da RN-13.
   *
   * A RN-13 do PLANEJAMENTO diz "lucro = entradas − saídas − custo das peças".
   * Aplicar isso ao pé da letra contaria a peça DUAS vezes: no regime de caixa,
   * a peça já virou saída quando foi comprada do distribuidor. O sistema usa
   * `lucroCaixa = faturamento − despesas` e publica `custoPecasVendidas` à parte,
   * como informação de margem. O código está certo; o texto da regra é que
   * ficou para trás — estes testes fixam o comportamento correto.
   */
  it('lucro no caixa é o que entrou menos o que saiu', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 }); // a peça custa 20
    const os = await ateConcluir(base, { qtdPeca: 2 });
    const dono = await donoDeTeste(SENHA_DONO);
    await ordens.receberPagamento(os.id, aVista, dono.id);

    await db.lancamentoCaixa.create({
      data: { tipo: 'SAIDA', origem: 'DESPESA', descricao: 'Energia', valor: 50, categoria: 'Energia' },
    });

    const r = await relatorios.resumoFinanceiro();

    expect(r.faturamento).toBe(200);
    expect(r.despesas).toBe(50);
    expect(r.lucroCaixa).toBe(150);

    // RN-14: o dono não pode confundir o que entrou com o que sobrou.
    expect(r.lucroCaixa).not.toBe(r.faturamento);
  });

  it('a peça vendida não é descontada duas vezes do lucro', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const os = await ateConcluir(base, { qtdPeca: 2 });
    const dono = await donoDeTeste(SENHA_DONO);
    await ordens.receberPagamento(os.id, aVista, dono.id);

    const r = await relatorios.resumoFinanceiro();

    // 2 peças a 20 de custo aparecem como informação...
    expect(r.custoPecasVendidas).toBe(40);
    // ...e a margem bruta delas: venderam por 100, custaram 40.
    expect(r.lucroBrutoPecas).toBe(60);
    // ...mas NÃO são abatidas de novo do caixa, senão o lucro cairia para 160.
    expect(r.lucroCaixa).toBe(200);
  });

  it('conta a receber ainda não recebida não vira lucro', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const os = await ateConcluir(base, { qtdPeca: 2 });
    const dono = await donoDeTeste(SENHA_DONO);

    await ordens.receberPagamento(
      os.id,
      { formaPagamento: 'FIADO', parcelas: 2, primeiroVencimentoDias: 30, liberarFiado: false },
      dono.id,
    );

    const r = await relatorios.resumoFinanceiro();
    expect(r.faturamento).toBe(0);
    expect(r.lucroCaixa).toBe(0);
  });
});
