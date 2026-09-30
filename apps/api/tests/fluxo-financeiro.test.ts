import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { UsuarioSessao } from '@hermes/shared';
import { db, limparDominio, configPadrao, cenarioBase, atores, usuario, estoqueDe, daquiDias, type Base } from './ajuda.js';
import * as orcamentos from '../src/modules/orcamentos/orcamentos.service.js';
import * as ordens from '../src/modules/ordens/ordens.service.js';
import * as contas from '../src/modules/contas/contas.service.js';
import * as relatorios from '../src/modules/relatorios/relatorios.service.js';

// ============================================================
// O caminho do dinheiro: orçamento → OS → estoque → caixa.
// É o núcleo do sistema e onde um erro custa caro de verdade,
// porque some sem ninguém perceber até o fim do mês.
// ============================================================

const SENHA_DONO = 'senha-do-dono';
let a: Awaited<ReturnType<typeof atores>>;

const pix = (valor: number) => ({ pagamentos: [{ forma: 'PIX' as const, valor }], liberarFiado: false });
const aPrazo = (forma: 'FIADO' | 'PARCELADO', parcelas: number, liberarFiado = false) => ({
  pagamentos: [],
  prazo: { forma, parcelas, primeiroVencimento: daquiDias(30) },
  liberarFiado,
});

async function novoOrcamento(
  base: Base,
  over: { qtdPeca?: number; desconto?: number; senhaDono?: string; ator?: UsuarioSessao; precoPeca?: number } = {},
) {
  return orcamentos.criar(
    {
      clienteId: base.cliente.id,
      carroId: base.carro.id,
      desconto: over.desconto ?? 0,
      senhaDono: over.senhaDono,
      servicos: [{ servicoId: base.servico.id, quantidade: 1 }],
      pecas: [{ pecaId: base.peca.id, quantidade: over.qtdPeca ?? 2, precoUnit: over.precoPeca }],
    },
    over.ator ?? a.atendente,
  );
}

/** Leva um orçamento até a OS concluída, pronta para receber pagamento. */
async function ateConcluir(base: Base, over: { qtdPeca?: number } = {}) {
  const orc = await novoOrcamento(base, over);
  const { os } = await orcamentos.aprovar(orc.id, { confirmarSemEstoque: false }, a.atendente);
  await ordens.mudarStatus(os.id, 'EM_EXECUCAO', a.atendente);
  return ordens.mudarStatus(os.id, 'CONCLUIDA', a.atendente);
}

beforeAll(async () => {
  a = await atores();
  await usuario('DONO', SENHA_DONO);
  a.dono = await usuario('DONO', SENHA_DONO);
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

  it('aceita quantidade fracionada (3,5 L) e fecha no centavo', async () => {
    const base = await cenarioBase({ precoServico: 80, precoPeca: 38 });
    const orc = await novoOrcamento(base, { qtdPeca: 3.5 });
    expect(orc.pecas[0].quantidade).toBe(3.5);
    expect(orc.subtotal).toBe(213); // 80 + 3,5 x 38
  });
});

describe('RN-07 e RN-01 — aprovar gera OS e baixa o estoque', () => {
  it('copia os itens com o preço combinado, baixa a peça e registra o movimento', async () => {
    const base = await cenarioBase({ estoque: 10 });
    const orc = await novoOrcamento(base, { qtdPeca: 3 });

    const { os, aguardandoPeca } = await orcamentos.aprovar(orc.id, { confirmarSemEstoque: false }, a.atendente);
    expect(aguardandoPeca).toBe(false);
    expect(os.status).toBe('ABERTA');
    expect(os.total).toBe(orc.total);

    // RN-01: o estoque baixou exatamente o que a OS consumiu, e o kardex fecha.
    expect(await estoqueDe(base.peca.id)).toBe(7);
    const mov = await db.movimentoEstoque.findMany({ where: { pecaId: base.peca.id } });
    expect(mov).toHaveLength(1);
    expect(mov[0].tipo).toBe('SAIDA');
    expect(Number(mov[0].quantidade)).toBe(3);
    expect(Number(mov[0].saldoApos)).toBe(7);
    expect(mov[0].osId).toBe(os.id);

    // O custo da peça fica "congelado" no item da OS (margem do relatório).
    const item = await db.oSPeca.findFirstOrThrow({ where: { osId: os.id } });
    expect(Number(item.custoUnit)).toBe(20);

    expect((await db.orcamento.findUniqueOrThrow({ where: { id: orc.id } })).status).toBe('APROVADO');
  });

  it('RN-03 — sem estoque, pede confirmação; confirmada, a OS nasce aguardando peça', async () => {
    const base = await cenarioBase({ estoque: 1 });
    const orc = await novoOrcamento(base, { qtdPeca: 5 });

    await expect(orcamentos.aprovar(orc.id, { confirmarSemEstoque: false }, a.atendente)).rejects.toMatchObject({
      statusCode: 409,
      codigo: 'ESTOQUE_INSUFICIENTE',
    });
    expect(await db.ordemServico.count()).toBe(0);

    const { os, aguardandoPeca } = await orcamentos.aprovar(orc.id, { confirmarSemEstoque: true }, a.atendente);
    expect(aguardandoPeca).toBe(true);
    expect(os.status).toBe('AGUARDANDO_PECA');
    // A peça "encomendada" deixa o saldo negativo — é o que falta chegar.
    expect(await estoqueDe(base.peca.id)).toBe(-4);
  });

  it('não aprova o mesmo orçamento duas vezes (não baixa estoque em dobro)', async () => {
    const base = await cenarioBase({ estoque: 10 });
    const orc = await novoOrcamento(base, { qtdPeca: 3 });
    await orcamentos.aprovar(orc.id, { confirmarSemEstoque: false }, a.atendente);

    await expect(orcamentos.aprovar(orc.id, { confirmarSemEstoque: false }, a.atendente)).rejects.toThrow(
      /já virou uma Ordem de Serviço/i,
    );
    expect(await estoqueDe(base.peca.id)).toBe(7); // continua 7, não 4
  });

  it('a KM de entrada atualiza o KM do veículo (só para frente)', async () => {
    const base = await cenarioBase();
    const orc = await novoOrcamento(base);
    await orcamentos.aprovar(orc.id, { confirmarSemEstoque: false, kmEntrada: 50_000 }, a.atendente);
    expect((await db.carro.findUniqueOrThrow({ where: { id: base.carro.id } })).kmAtual).toBe(50_000);

    const orc2 = await novoOrcamento(base);
    await orcamentos.aprovar(orc2.id, { confirmarSemEstoque: false, kmEntrada: 40_000 }, a.atendente);
    expect((await db.carro.findUniqueOrThrow({ where: { id: base.carro.id } })).kmAtual).toBe(50_000);
  });
});

describe('RN-06 — orçamento vence sozinho', () => {
  it('marca como EXPIRADO na leitura e recusa virar OS', async () => {
    const base = await cenarioBase();
    const orc = await novoOrcamento(base);
    await db.orcamento.update({ where: { id: orc.id }, data: { validade: new Date(Date.now() - 1000) } });

    const lista = await orcamentos.listar({ pagina: 1, porPagina: 25 });
    expect(lista.itens.find((o) => o.id === orc.id)?.status).toBe('EXPIRADO');

    await expect(orcamentos.aprovar(orc.id, { confirmarSemEstoque: false }, a.atendente)).rejects.toThrow(/expirado/i);
  });

  it('orçamento aprovado não expira', async () => {
    const base = await cenarioBase();
    const orc = await novoOrcamento(base);
    await orcamentos.aprovar(orc.id, { confirmarSemEstoque: false }, a.atendente);
    await db.orcamento.update({ where: { id: orc.id }, data: { validade: new Date(Date.now() - 1000) } });

    await orcamentos.listar({ pagina: 1, porPagina: 25 });
    expect((await db.orcamento.findUniqueOrThrow({ where: { id: orc.id } })).status).toBe('APROVADO');
  });

  it('"refazer com os preços de hoje" copia os itens com o preço atual do catálogo', async () => {
    const base = await cenarioBase({ precoServico: 100 });
    const orc = await novoOrcamento(base, { qtdPeca: 1 });
    await db.servico.update({ where: { id: base.servico.id }, data: { precoMaoDeObra: 130 } });

    const novo = await orcamentos.duplicar(orc.id, a.atendente);
    expect(novo.id).not.toBe(orc.id);
    expect(novo.servicos[0].precoUnit).toBe(130);
    expect(novo.status).toBe('RASCUNHO');
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

  it('o próprio Dono não precisa digitar a senha dele', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const orc = await novoOrcamento(base, { qtdPeca: 2, desconto: 60, ator: a.dono });
    expect(orc.total).toBe(140);
  });

  it('baixar o preço do item conta como desconto (não dá para contornar o teto)', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    // Peça de 50 por 20 (2x): 60 abaixo da tabela = 30% de 200.
    await expect(novoOrcamento(base, { qtdPeca: 2, precoPeca: 20 })).rejects.toMatchObject({
      codigo: 'SENHA_DONO_NECESSARIA',
    });
  });

  it('o mecânico não pode alterar preço nem dar desconto', async () => {
    const base = await cenarioBase();
    await expect(novoOrcamento(base, { desconto: 1, ator: a.mecanico })).rejects.toMatchObject({ statusCode: 403 });
    await expect(novoOrcamento(base, { precoPeca: 49, ator: a.mecanico })).rejects.toMatchObject({ statusCode: 403 });
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
    const vazia = await ordens.criar(
      { clienteId: base.cliente.id, carroId: base.carro.id, desconto: 0, servicos: [], pecas: [], confirmarSemEstoque: false },
      a.atendente,
    );
    await ordens.mudarStatus(vazia.id, 'EM_EXECUCAO', a.atendente);
    await expect(ordens.mudarStatus(vazia.id, 'CONCLUIDA', a.atendente)).rejects.toThrow(/ao menos 1 serviço ou peça/i);
  });

  it('à vista gera a entrada no livro-caixa e entrega a OS', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const os = await ateConcluir(base, { qtdPeca: 2 });

    const r = await ordens.receber(os.id, pix(200), a.atendente);
    expect(r.pago).toBe(true);
    expect(r.status).toBe('ENTREGUE');
    expect(r.formaPagamento).toBe('PIX');
    expect(r.recebido).toBe(200);

    const lancamentos = await db.lancamentoCaixa.findMany({ where: { osId: os.id } });
    expect(lancamentos).toHaveLength(1);
    expect(Number(lancamentos[0].valor)).toBe(200);
    expect(await db.contaReceber.count()).toBe(0);
  });

  it('pagamento dividido (dinheiro + cartão) gera um lançamento por forma', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const os = await ateConcluir(base, { qtdPeca: 2 });

    const r = await ordens.receber(
      os.id,
      {
        pagamentos: [
          { forma: 'A_VISTA', valor: 50 },
          { forma: 'CARTAO', valor: 150 },
        ],
        liberarFiado: false,
      },
      a.atendente,
    );
    expect(r.formaPagamento).toBe('MISTO');
    expect(r.pago).toBe(true);
    expect(await db.lancamentoCaixa.count({ where: { osId: os.id } })).toBe(2);
  });

  it('a soma precisa fechar com o total — nem a menos, nem a mais', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const os = await ateConcluir(base, { qtdPeca: 2 });
    await expect(ordens.receber(os.id, pix(150), a.atendente)).rejects.toThrow(/Faltam/);
    await expect(ordens.receber(os.id, pix(250), a.atendente)).rejects.toThrow(/mais que o total/);
    expect(await db.lancamentoCaixa.count()).toBe(0);
  });

  it('não recebe duas vezes a mesma OS', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const os = await ateConcluir(base, { qtdPeca: 2 });

    await ordens.receber(os.id, pix(200), a.atendente);
    await expect(ordens.receber(os.id, pix(200), a.atendente)).rejects.toThrow(/já foi registrado/i);
    expect(await db.lancamentoCaixa.count({ where: { osId: os.id } })).toBe(1);
  });

  it('OS a prazo NÃO pode ser "recebida" de novo (a cobrança em dobro da versão antiga)', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const os = await ateConcluir(base, { qtdPeca: 2 });

    await ordens.receber(os.id, aPrazo('FIADO', 2), a.atendente);
    await expect(ordens.receber(os.id, pix(200), a.atendente)).rejects.toThrow(/já foi registrado/i);
    await expect(ordens.receber(os.id, aPrazo('FIADO', 2), a.atendente)).rejects.toThrow(/já foi registrado/i);
    expect(await db.contaReceber.count()).toBe(2);
    expect(await db.lancamentoCaixa.count()).toBe(0);
  });

  it('não recebe OS que ainda não foi concluída', async () => {
    const base = await cenarioBase();
    const orc = await novoOrcamento(base);
    const { os } = await orcamentos.aprovar(orc.id, { confirmarSemEstoque: false }, a.atendente);
    await expect(ordens.receber(os.id, pix(orc.total), a.atendente)).rejects.toThrow(/Conclua a OS/i);
  });

  it('RN-11.1 — parcelado cria parcelas mensais e NÃO entra no caixa ainda', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const os = await ateConcluir(base, { qtdPeca: 2 });

    const r = await ordens.receber(os.id, aPrazo('PARCELADO', 3), a.atendente);
    expect(r.pago).toBe(false);
    expect(r.aReceber).toBe(200);

    const parcelas = await db.contaReceber.findMany({ where: { osId: os.id }, orderBy: { parcela: 'asc' } });
    expect(parcelas).toHaveLength(3);
    expect(parcelas.reduce((s, p) => s + Number(p.valor), 0)).toBe(200);
    // Mesmo dia nos meses seguintes.
    const dias = parcelas.map((p) => p.vencimento.getDate());
    expect(new Set(dias).size).toBeLessThanOrEqual(2); // fim de mês curto pode puxar o dia
    expect(parcelas[1].vencimento.getMonth()).toBe((parcelas[0].vencimento.getMonth() + 1) % 12);

    // Regime de caixa: nada entrou ainda.
    expect(await db.lancamentoCaixa.count({ where: { osId: os.id } })).toBe(0);
  });

  it('entrada + restante a prazo', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const os = await ateConcluir(base, { qtdPeca: 2 });

    const r = await ordens.receber(
      os.id,
      { pagamentos: [{ forma: 'PIX', valor: 80 }], prazo: { forma: 'PARCELADO', parcelas: 2, primeiroVencimento: daquiDias(30) }, liberarFiado: false },
      a.atendente,
    );
    expect(r.formaPagamento).toBe('MISTO');
    expect(r.recebido).toBe(80);
    expect(r.aReceber).toBe(120);
    expect(r.parcelas.map((p) => p.valor)).toEqual([60, 60]);
  });

  it('parcela quebrada não perde nem inventa centavo', async () => {
    const base = await cenarioBase({ precoServico: 100 });
    const orc = await orcamentos.criar(
      { clienteId: base.cliente.id, carroId: base.carro.id, desconto: 0, servicos: [{ servicoId: base.servico.id, quantidade: 1 }], pecas: [] },
      a.atendente,
    );
    const { os } = await orcamentos.aprovar(orc.id, { confirmarSemEstoque: false }, a.atendente);
    await ordens.mudarStatus(os.id, 'EM_EXECUCAO', a.atendente);
    await ordens.mudarStatus(os.id, 'CONCLUIDA', a.atendente);

    // 100 / 3 = 33,333... — o teste existe justamente por causa disso.
    await ordens.receber(os.id, aPrazo('FIADO', 3), a.atendente);
    const parcelas = await db.contaReceber.findMany({ where: { osId: os.id } });
    expect(parcelas.reduce((s, p) => s + Number(p.valor), 0)).toBe(100);
  });

  it('recebida a última parcela, a OS passa a constar como paga', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const os = await ateConcluir(base, { qtdPeca: 2 });
    const r = await ordens.receber(os.id, aPrazo('FIADO', 2), a.atendente);

    await contas.receber(r.parcelas[0].id, { formaPagamento: 'A_VISTA' }, a.atendente);
    expect((await db.ordemServico.findUniqueOrThrow({ where: { id: os.id } })).pago).toBe(false);
    await contas.receber(r.parcelas[1].id, { formaPagamento: 'PIX' }, a.atendente);
    expect((await db.ordemServico.findUniqueOrThrow({ where: { id: os.id } })).pago).toBe(true);

    // Cada baixa entrou no caixa ligada à OS e à parcela.
    const entradas = await db.lancamentoCaixa.findMany({ where: { osId: os.id } });
    expect(entradas).toHaveLength(2);
    expect(entradas.every((l) => l.contaReceberId)).toBe(true);
  });

  it('baixa parcial: a parcela continua pendente com o saldo que falta', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const os = await ateConcluir(base, { qtdPeca: 2 });
    const r = await ordens.receber(os.id, aPrazo('FIADO', 1), a.atendente);

    const p = await contas.receber(r.parcelas[0].id, { formaPagamento: 'A_VISTA', valor: 70 }, a.atendente);
    expect(p.status).toBe('PENDENTE');
    expect(p.valorPago).toBe(70);
    expect(p.saldo).toBe(130);

    await expect(contas.receber(p.id, { formaPagamento: 'A_VISTA', valor: 131 }, a.atendente)).rejects.toThrow(/passa do que falta/);
    const quitada = await contas.receber(p.id, { formaPagamento: 'A_VISTA' }, a.atendente);
    expect(quitada.status).toBe('PAGA');
    expect(quitada.saldo).toBe(0);
  });
});

describe('RN-11.2 — fiado em atraso trava novo fiado', () => {
  async function comDividaVencida() {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    await db.contaReceber.create({
      data: { clienteId: base.cliente.id, valor: 300, vencimento: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
    });
    return { base, os: await ateConcluir(base, { qtdPeca: 2 }) };
  }

  it('barra o fiado de quem tem parcela vencida', async () => {
    const { os } = await comDividaVencida();
    await expect(ordens.receber(os.id, aPrazo('FIADO', 2), a.atendente)).rejects.toMatchObject({
      statusCode: 409,
      codigo: 'FIADO_BLOQUEADO',
    });
  });

  it('à vista nunca é barrado — quitar sempre pode', async () => {
    const { os } = await comDividaVencida();
    const r = await ordens.receber(os.id, { pagamentos: [{ forma: 'A_VISTA', valor: 200 }], liberarFiado: false }, a.atendente);
    expect(r.pago).toBe(true);
  });

  it('liberar assumindo o risco deixa passar', async () => {
    const { os } = await comDividaVencida();
    const r = await ordens.receber(os.id, aPrazo('FIADO', 2, true), a.atendente);
    expect(r.parcelas).toHaveLength(2);
  });
});

describe('estorno — desfazer o recebimento sem apagar nada', () => {
  it('devolve o que entrou como ESTORNO, cancela as parcelas e reabre para cobrar', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const os = await ateConcluir(base, { qtdPeca: 2 });
    const r = await ordens.receber(
      os.id,
      { pagamentos: [{ forma: 'PIX', valor: 100 }], prazo: { forma: 'FIADO', parcelas: 2, primeiroVencimento: daquiDias(30) }, liberarFiado: false },
      a.atendente,
    );
    await contas.receber(r.parcelas[0].id, { formaPagamento: 'A_VISTA', valor: 20 }, a.atendente);

    const e = await ordens.estornarPagamento(os.id, 'lancei errado', a.dono);
    expect(e.status).toBe('CONCLUIDA');
    expect(e.formaPagamento).toBeNull();
    expect(e.recebido).toBe(0);
    expect(e.parcelas.every((p) => p.status === 'CANCELADA')).toBe(true);

    const estorno = await db.lancamentoCaixa.findFirstOrThrow({ where: { osId: os.id, origem: 'ESTORNO' } });
    expect(Number(estorno.valor)).toBe(120); // 100 do PIX + 20 da baixa parcial
    // Nada foi apagado do caixa.
    expect(await db.lancamentoCaixa.count({ where: { osId: os.id } })).toBe(3);

    // E dá para receber certo agora.
    const denovo = await ordens.receber(os.id, pix(200), a.atendente);
    expect(denovo.pago).toBe(true);
  });
});

describe('RN-13 e RN-14 — lucro não é faturamento', () => {
  it('lucro é o que entrou da operação menos o que saiu', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const os = await ateConcluir(base, { qtdPeca: 2 });
    await ordens.receber(os.id, pix(200), a.atendente);
    await db.lancamentoCaixa.create({ data: { tipo: 'SAIDA', origem: 'DESPESA', descricao: 'Energia', valor: 50, categoria: 'Energia' } });

    const r = await relatorios.resumo({});
    expect(r.faturamento).toBe(200);
    expect(r.despesas).toBe(50);
    expect(r.lucro).toBe(150);
    expect(r.numOrdens).toBe(1);
    expect(r.ticketMedio).toBe(200);
  });

  it('aporte e retirada do dono não são faturamento nem despesa', async () => {
    await db.lancamentoCaixa.createMany({
      data: [
        { tipo: 'ENTRADA', origem: 'APORTE', descricao: 'Troco inicial', valor: 1000 },
        { tipo: 'SAIDA', origem: 'RETIRADA', descricao: 'Pró-labore', valor: 400 },
      ],
    });
    const r = await relatorios.resumo({});
    expect(r.faturamento).toBe(0);
    expect(r.despesas).toBe(0);
    expect(r.lucro).toBe(0);
    expect(r.aportes).toBe(1000);
    expect(r.retiradas).toBe(400);
  });

  it('estorno tira do faturamento', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const os = await ateConcluir(base, { qtdPeca: 2 });
    await ordens.receber(os.id, pix(200), a.atendente);
    await ordens.estornarPagamento(os.id, 'desistiu', a.dono);

    const r = await relatorios.resumo({});
    expect(r.faturamento).toBe(0);
    expect(r.estornos).toBe(200);
  });

  it('a peça vendida não é descontada duas vezes do lucro', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 }); // a peça custa 20
    const os = await ateConcluir(base, { qtdPeca: 2 });
    await ordens.receber(os.id, pix(200), a.atendente);

    const r = await relatorios.resumo({});
    expect(r.custoPecasVendidas).toBe(40);
    expect(r.lucroBrutoPecas).toBe(60);
    expect(r.lucro).toBe(200); // e NÃO 160
  });

  it('conta a receber ainda não recebida não vira lucro', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const os = await ateConcluir(base, { qtdPeca: 2 });
    await ordens.receber(os.id, aPrazo('FIADO', 2), a.atendente);

    const r = await relatorios.resumo({});
    expect(r.faturamento).toBe(0);
    expect(r.lucro).toBe(0);
  });

  it('evolução mensal mostra o mês corrente', async () => {
    const base = await cenarioBase({ precoServico: 100, precoPeca: 50 });
    const os = await ateConcluir(base, { qtdPeca: 2 });
    await ordens.receber(os.id, pix(200), a.atendente);

    const { meses } = await relatorios.evolucao(3);
    expect(meses).toHaveLength(3);
    const atual = meses[meses.length - 1];
    expect(atual.faturamento).toBe(200);
    expect(atual.numOrdens).toBe(1);
  });
});
