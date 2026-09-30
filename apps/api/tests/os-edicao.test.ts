import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { db, limparDominio, configPadrao, cenarioBase, atores, estoqueDe, daquiDias, type Base } from './ajuda.js';
import * as ordens from '../src/modules/ordens/ordens.service.js';

// ============================================================
// A OS de verdade muda depois de aberta: o mecânico abre o carro
// e acha mais um problema, a peça usada não era a do orçamento,
// o cliente desistiu. Cada mudança precisa manter estoque, total
// e caixa batendo — sem ninguém refazer conta na mão.
// ============================================================

let a: Awaited<ReturnType<typeof atores>>;

/** Um segundo mecânico (os usuários sobrevivem entre os testes: upsert). */
const outroMecanico = (email: string) =>
  db.usuario.upsert({ where: { email }, update: {}, create: { nome: 'Outro mecânico', email, senhaHash: 'x', perfil: 'MECANICO' } });

const abrir = (base: Base, over: { qtdPeca?: number; mecanicoId?: string } = {}) =>
  ordens.criar(
    {
      clienteId: base.cliente.id,
      carroId: base.carro.id,
      mecanicoId: over.mecanicoId,
      desconto: 0,
      servicos: [{ servicoId: base.servico.id, quantidade: 1 }],
      pecas: over.qtdPeca ? [{ pecaId: base.peca.id, quantidade: over.qtdPeca }] : [],
      confirmarSemEstoque: false,
    },
    a.atendente,
  );

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

describe('OS direta (sem orçamento)', () => {
  it('abre com itens, baixa o estoque e anota KM e queixa', async () => {
    const base = await cenarioBase({ estoque: 10, precoServico: 100, precoPeca: 50 });
    const os = await ordens.criar(
      {
        clienteId: base.cliente.id,
        carroId: base.carro.id,
        kmEntrada: 30_000,
        defeitoRelatado: 'Barulho ao frear',
        desconto: 0,
        servicos: [{ servicoId: base.servico.id, quantidade: 1 }],
        pecas: [{ pecaId: base.peca.id, quantidade: 2 }],
        confirmarSemEstoque: false,
      },
      a.atendente,
    );
    expect(os.total).toBe(200);
    expect(os.orcamento).toBeNull();
    expect(os.kmEntrada).toBe(30_000);
    expect(os.defeitoRelatado).toBe('Barulho ao frear');
    expect(await estoqueDe(base.peca.id)).toBe(8);
  });

  it('pode nascer vazia (carro entrou para diagnóstico) — sem nada a receber', async () => {
    const base = await cenarioBase();
    const os = await ordens.criar(
      { clienteId: base.cliente.id, carroId: base.carro.id, desconto: 0, servicos: [], pecas: [], confirmarSemEstoque: false },
      a.atendente,
    );
    expect(os.total).toBe(0);
    expect(os.status).toBe('ABERTA');
  });
});

describe('itens da OS mexem no estoque na hora', () => {
  it('lançar peça baixa; mudar a quantidade move só a diferença; tirar devolve', async () => {
    const base = await cenarioBase({ estoque: 10, precoServico: 100, precoPeca: 50 });
    let os = await abrir(base);

    os = await ordens.adicionarPeca(os.id, { pecaId: base.peca.id, quantidade: 2, confirmarSemEstoque: false }, a.atendente);
    expect(await estoqueDe(base.peca.id)).toBe(8);
    expect(os.total).toBe(200);

    const item = os.pecas[0];
    os = await ordens.alterarPeca(os.id, item.id, { quantidade: 3.5, confirmarSemEstoque: false }, a.atendente);
    expect(await estoqueDe(base.peca.id)).toBe(6.5);
    expect(os.total).toBe(275);

    os = await ordens.alterarPeca(os.id, item.id, { quantidade: 1, confirmarSemEstoque: false }, a.atendente);
    expect(await estoqueDe(base.peca.id)).toBe(9);

    os = await ordens.removerPeca(os.id, item.id, a.atendente);
    expect(await estoqueDe(base.peca.id)).toBe(10);
    expect(os.pecas).toHaveLength(0);
    expect(os.total).toBe(100);

    // O kardex conta a história toda e termina no saldo da prateleira.
    const movs = await db.movimentoEstoque.findMany({ where: { pecaId: base.peca.id }, orderBy: { data: 'asc' } });
    expect(movs.map((m) => [m.tipo, Number(m.quantidade), Number(m.saldoApos)])).toEqual([
      ['SAIDA', 2, 8],
      ['SAIDA', 1.5, 6.5],
      ['ENTRADA', 2.5, 9],
      ['ENTRADA', 1, 10],
    ]);
  });

  it('RN-03 — sem estoque, pede confirmação; confirmado, a OS passa a aguardar peça', async () => {
    const base = await cenarioBase({ estoque: 1 });
    const os = await abrir(base);
    await ordens.mudarStatus(os.id, 'EM_EXECUCAO', a.atendente);

    await expect(
      ordens.adicionarPeca(os.id, { pecaId: base.peca.id, quantidade: 3, confirmarSemEstoque: false }, a.atendente),
    ).rejects.toMatchObject({ codigo: 'ESTOQUE_INSUFICIENTE' });
    expect(await estoqueDe(base.peca.id)).toBe(1);

    const r = await ordens.adicionarPeca(os.id, { pecaId: base.peca.id, quantidade: 3, confirmarSemEstoque: true }, a.atendente);
    expect(r.status).toBe('AGUARDANDO_PECA');
    expect(await estoqueDe(base.peca.id)).toBe(-2);
  });

  it('serviço extra entra no total; repetido é recusado', async () => {
    const base = await cenarioBase({ precoServico: 100 });
    const extra = await db.servico.create({ data: { nome: 'Alinhamento', precoMaoDeObra: 80 } });
    let os = await abrir(base);

    os = await ordens.adicionarServico(os.id, { servicoId: extra.id, quantidade: 1 }, a.atendente);
    expect(os.total).toBe(180);
    await expect(ordens.adicionarServico(os.id, { servicoId: extra.id, quantidade: 1 }, a.atendente)).rejects.toThrow(/já está na OS/);

    const linha = os.servicos.find((s) => s.servicoId === extra.id)!;
    os = await ordens.removerServico(os.id, linha.id, a.atendente);
    expect(os.total).toBe(100);
  });

  it('desconto na OS respeita o teto (RN-08)', async () => {
    const base = await cenarioBase({ precoServico: 100 });
    const os = await abrir(base);
    await expect(ordens.atualizar(os.id, { desconto: 30 }, a.atendente)).rejects.toMatchObject({ codigo: 'SENHA_DONO_NECESSARIA' });
    const ok = await ordens.atualizar(os.id, { desconto: 10 }, a.atendente);
    expect(ok.total).toBe(90);
  });

  it('depois do pagamento registrado, a OS não muda (estorne antes)', async () => {
    const base = await cenarioBase({ precoServico: 100 });
    const os = await abrir(base);
    await ordens.mudarStatus(os.id, 'EM_EXECUCAO', a.atendente);
    await ordens.mudarStatus(os.id, 'CONCLUIDA', a.atendente);
    await ordens.receber(os.id, { pagamentos: [], prazo: { forma: 'FIADO', parcelas: 1, primeiroVencimento: daquiDias(10) }, liberarFiado: false }, a.atendente);

    await expect(ordens.adicionarPeca(os.id, { pecaId: base.peca.id, quantidade: 1, confirmarSemEstoque: false }, a.atendente)).rejects.toThrow(
      /(pagamento desta OS já foi registrado|entregue ou cancelada)/,
    );
  });
});

describe('fluxo e entrega', () => {
  it('o carro não sai sem o pagamento registrado', async () => {
    const base = await cenarioBase({ precoServico: 100 });
    const os = await abrir(base);
    await ordens.mudarStatus(os.id, 'EM_EXECUCAO', a.atendente);
    await ordens.mudarStatus(os.id, 'CONCLUIDA', a.atendente);
    await expect(ordens.mudarStatus(os.id, 'ENTREGUE', a.atendente)).rejects.toThrow(/Registre o pagamento/);
  });

  it('OS paga não reabre sem estorno', async () => {
    const base = await cenarioBase({ precoServico: 100 });
    const os = await abrir(base);
    await ordens.mudarStatus(os.id, 'EM_EXECUCAO', a.atendente);
    await ordens.mudarStatus(os.id, 'CONCLUIDA', a.atendente);
    await ordens.receber(os.id, { pagamentos: [{ forma: 'PIX', valor: 100 }], liberarFiado: false }, a.atendente);
    // Já está ENTREGUE (receber entrega). Nada volta para execução.
    await expect(ordens.mudarStatus(os.id, 'EM_EXECUCAO', a.atendente)).rejects.toThrow();
  });

  it('cancelar devolve TODAS as peças ao estoque e guarda o motivo', async () => {
    const base = await cenarioBase({ estoque: 10 });
    const os = await abrir(base, { qtdPeca: 4 });
    expect(await estoqueDe(base.peca.id)).toBe(6);

    const c = await ordens.cancelar(os.id, 'Cliente desistiu', a.atendente);
    expect(c.status).toBe('CANCELADA');
    expect(c.motivoCancelamento).toBe('Cliente desistiu');
    expect(await estoqueDe(base.peca.id)).toBe(10);
    await expect(ordens.cancelar(os.id, 'de novo', a.atendente)).rejects.toThrow(/já está cancelada/);
  });

  it('OS com pagamento não cancela (estorne primeiro)', async () => {
    const base = await cenarioBase({ precoServico: 100 });
    const os = await abrir(base);
    await ordens.mudarStatus(os.id, 'EM_EXECUCAO', a.atendente);
    await ordens.mudarStatus(os.id, 'CONCLUIDA', a.atendente);
    await ordens.receber(os.id, { pagamentos: [], prazo: { forma: 'FIADO', parcelas: 1, primeiroVencimento: daquiDias(10) }, liberarFiado: false }, a.atendente);
    await expect(ordens.cancelar(os.id, 'x', a.atendente)).rejects.toThrow(/entregue não pode ser cancelada|Estorne/);
  });
});

describe('o que o mecânico pode e não pode', () => {
  it('vê as OS dele e as sem mecânico — não as dos outros', async () => {
    const base = await cenarioBase();
    const outro = await outroMecanico('outro.mec@hermes.local');
    const minha = await abrir(base, { mecanicoId: a.mecanico.id });
    const livre = await abrir(base);
    const deOutro = await abrir(base, { mecanicoId: outro.id });

    const lista = await ordens.listar({ pagina: 1, porPagina: 25 }, a.mecanico);
    const ids = lista.itens.map((o) => o.id);
    expect(ids).toContain(minha.id);
    expect(ids).toContain(livre.id);
    expect(ids).not.toContain(deOutro.id);
    await expect(ordens.buscar(deOutro.id, a.mecanico)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('assume uma OS livre (e só uma pessoa consegue)', async () => {
    const base = await cenarioBase();
    const livre = await abrir(base);
    const r = await ordens.assumir(livre.id, a.mecanico);
    expect(r.mecanico?.id).toBe(a.mecanico.id);
    await expect(ordens.assumir(livre.id, a.mecanico)).rejects.toThrow(/já está com alguém/);
  });

  it('na OS dele: muda status, aponta serviço, escreve laudo e lança peça', async () => {
    const base = await cenarioBase({ estoque: 5 });
    const os = await abrir(base, { mecanicoId: a.mecanico.id });

    await ordens.mudarStatus(os.id, 'EM_EXECUCAO', a.mecanico);
    const apontada = await ordens.alterarServico(os.id, os.servicos[0].id, { concluido: true }, a.mecanico);
    expect(apontada.servicos[0].concluido).toBe(true);
    const laudo = await ordens.atualizar(os.id, { observacoes: 'Pastilha no fim' }, a.mecanico);
    expect(laudo.observacoes).toBe('Pastilha no fim');
    const comPeca = await ordens.adicionarPeca(os.id, { pecaId: base.peca.id, quantidade: 1, confirmarSemEstoque: false }, a.mecanico);
    expect(comPeca.pecas).toHaveLength(1);
    expect(await estoqueDe(base.peca.id)).toBe(4);
  });

  it('não mexe em valores, não entrega e não vê o dinheiro nem o telefone do cliente', async () => {
    const base = await cenarioBase();
    const os = await abrir(base, { mecanicoId: a.mecanico.id });

    await expect(ordens.atualizar(os.id, { desconto: 5 }, a.mecanico)).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      ordens.alterarServico(os.id, os.servicos[0].id, { precoUnit: 1 }, a.mecanico),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      ordens.adicionarPeca(os.id, { pecaId: base.peca.id, quantidade: 1, precoUnit: 1, confirmarSemEstoque: false }, a.mecanico),
    ).rejects.toMatchObject({ statusCode: 403 });

    await ordens.mudarStatus(os.id, 'EM_EXECUCAO', a.mecanico);
    await ordens.mudarStatus(os.id, 'CONCLUIDA', a.mecanico);
    await expect(ordens.mudarStatus(os.id, 'ENTREGUE', a.mecanico)).rejects.toMatchObject({ statusCode: 403 });

    const vista = await ordens.buscar(os.id, a.mecanico);
    expect(vista.cliente.telefone).toBeNull();
    expect(vista.pagamentos).toEqual([]);
  });

  it('não mexe na OS de outro mecânico', async () => {
    const base = await cenarioBase();
    const outro = await outroMecanico('outro2.mec@hermes.local');
    const os = await abrir(base, { mecanicoId: outro.id });
    await expect(ordens.mudarStatus(os.id, 'EM_EXECUCAO', a.mecanico)).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      ordens.adicionarPeca(os.id, { pecaId: base.peca.id, quantidade: 1, confirmarSemEstoque: false }, a.mecanico),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
