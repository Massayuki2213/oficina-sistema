import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { db, limparDominio, configPadrao, cenarioBase, atores, estoqueDe, DIA, type Base } from './ajuda.js';
import * as orcamentos from '../src/modules/orcamentos/orcamentos.service.js';
import * as ordens from '../src/modules/ordens/ordens.service.js';
import * as agenda from '../src/modules/agenda/agenda.service.js';
import * as alertas from '../src/modules/alertas/alertas.service.js';

// Regras que protegem o cliente e a agenda: garantia (RN-18), conflito de
// horário (RN-19) e oportunidades de retorno (RN-20).

let a: Awaited<ReturnType<typeof atores>>;

async function osEntregue(base: Base) {
  const orc = await orcamentos.criar(
    {
      clienteId: base.cliente.id,
      carroId: base.carro.id,
      desconto: 0,
      servicos: [{ servicoId: base.servico.id, quantidade: 1 }],
      pecas: [{ pecaId: base.peca.id, quantidade: 1 }],
    },
    a.atendente,
  );
  const { os } = await orcamentos.aprovar(orc.id, { confirmarSemEstoque: false }, a.atendente);
  await ordens.mudarStatus(os.id, 'EM_EXECUCAO', a.atendente);
  await ordens.mudarStatus(os.id, 'CONCLUIDA', a.atendente);
  await ordens.receber(os.id, { pagamentos: [{ forma: 'PIX', valor: orc.total }], liberarFiado: false }, a.atendente);
  return os;
}

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

describe('RN-18 — OS de garantia', () => {
  it('abre sem cobrar, copiando só a mão de obra', async () => {
    const base = await cenarioBase();
    const os = await osEntregue(base);

    const { os: gar, origem } = await ordens.abrirGarantia(os.id, {}, a.atendente);
    expect(gar.garantia).toBe(true);
    expect(gar.total).toBe(0);
    expect(gar.pago).toBe(true); // não gera dívida nem entrada no caixa
    expect(gar.osOrigem?.numero).toBe(os.numero);
    expect(origem.numero).toBe(os.numero);
    expect(gar.servicos).toHaveLength(1);
    expect(gar.servicos[0].precoUnit).toBe(0);
    // Peça é custo real e entra pelo fluxo normal — não vem de graça na garantia.
    expect(gar.pecas).toHaveLength(0);
  });

  it('a garantia não mexe no caixa nem no estoque', async () => {
    const base = await cenarioBase({ estoque: 10 });
    const os = await osEntregue(base);
    const estoqueAntes = await estoqueDe(base.peca.id);
    const caixaAntes = await db.lancamentoCaixa.count();

    await ordens.abrirGarantia(os.id, {}, a.atendente);

    expect(await estoqueDe(base.peca.id)).toBe(estoqueAntes);
    expect(await db.lancamentoCaixa.count()).toBe(caixaAntes);
    expect(await db.contaReceber.count()).toBe(0);
  });

  it('OS de garantia sem valor sai entregue sem passar pelo caixa', async () => {
    const base = await cenarioBase();
    const os = await osEntregue(base);
    const { os: gar } = await ordens.abrirGarantia(os.id, {}, a.atendente);

    await ordens.mudarStatus(gar.id, 'EM_EXECUCAO', a.atendente);
    await ordens.mudarStatus(gar.id, 'CONCLUIDA', a.atendente);
    const entregue = await ordens.mudarStatus(gar.id, 'ENTREGUE', a.atendente);
    expect(entregue.status).toBe('ENTREGUE');
  });

  it('recusa depois do prazo, com a data do vencimento na mensagem', async () => {
    const base = await cenarioBase();
    const os = await osEntregue(base);
    await db.ordemServico.update({ where: { id: os.id }, data: { dataConclusao: new Date(Date.now() - 40 * DIA) } });

    await expect(ordens.abrirGarantia(os.id, {}, a.atendente)).rejects.toThrow(/garantia de 15 dias venceu/i);
  });

  it('o prazo vem da configuração', async () => {
    await configPadrao({ garantiaDias: 60 });
    const base = await cenarioBase();
    const os = await osEntregue(base);
    await db.ordemServico.update({ where: { id: os.id }, data: { dataConclusao: new Date(Date.now() - 40 * DIA) } });

    const { os: gar } = await ordens.abrirGarantia(os.id, {}, a.atendente);
    expect(gar.garantia).toBe(true);
  });

  it('não abre garantia de uma garantia', async () => {
    const base = await cenarioBase();
    const os = await osEntregue(base);
    const { os: gar } = await ordens.abrirGarantia(os.id, {}, a.atendente);
    await expect(ordens.abrirGarantia(gar.id, {}, a.atendente)).rejects.toThrow(/já é uma garantia/i);
  });

  it('não abre garantia de OS que ainda não terminou', async () => {
    const base = await cenarioBase();
    const orc = await orcamentos.criar(
      { clienteId: base.cliente.id, carroId: base.carro.id, desconto: 0, servicos: [{ servicoId: base.servico.id, quantidade: 1 }], pecas: [] },
      a.atendente,
    );
    const { os } = await orcamentos.aprovar(orc.id, { confirmarSemEstoque: false }, a.atendente);
    await expect(ordens.abrirGarantia(os.id, {}, a.atendente)).rejects.toThrow(/depois que o serviço foi concluído/i);
  });

  it('a OS de origem passa a listar a garantia aberta', async () => {
    const base = await cenarioBase();
    const os = await osEntregue(base);
    const { os: gar } = await ordens.abrirGarantia(os.id, {}, a.atendente);

    const situacao = await ordens.situacaoGarantia(os.id, a.atendente);
    expect(situacao.garantiasAbertas.map((g) => g.numero)).toContain(gar.numero);
  });
});

describe('RN-19 — conflito de horário', () => {
  const daquiA = (min: number) => new Date(Date.now() + min * 60 * 1000).toISOString();

  function marcar(base: Base, quando: string, ignorarConflito = false) {
    return agenda.criar({ clienteId: base.cliente.id, carroId: base.carro.id, dataHora: quando, tipo: 'REVISAO', ignorarConflito });
  }

  it('avisa quando cai na mesma janela, com código para a tela perguntar', async () => {
    const base = await cenarioBase();
    await marcar(base, daquiA(120));
    await expect(marcar(base, daquiA(135))).rejects.toMatchObject({ statusCode: 409, codigo: 'CONFLITO_AGENDA' });
  });

  it('fora da janela de 30 min não é conflito', async () => {
    const base = await cenarioBase();
    await marcar(base, daquiA(120));
    const segunda = await marcar(base, daquiA(180));
    expect(segunda.id).toBeTruthy();
  });

  it('quem confirma consegue encaixar mesmo assim', async () => {
    const base = await cenarioBase();
    await marcar(base, daquiA(120));
    const encaixe = await marcar(base, daquiA(135), true);
    expect(encaixe.id).toBeTruthy();
    expect(await db.visita.count()).toBe(2);
  });

  it('agendamento já realizado não bloqueia o horário', async () => {
    const base = await cenarioBase();
    const primeira = await marcar(base, daquiA(120));
    await agenda.alterarStatus(primeira.id, 'REALIZADA');
    const segunda = await marcar(base, daquiA(125));
    expect(segunda.id).toBeTruthy();
  });

  it('remarcar não conflita com o próprio horário', async () => {
    const base = await cenarioBase();
    const visita = await marcar(base, daquiA(120));
    const remarcada = await agenda.atualizar(visita.id, { dataHora: daquiA(125), ignorarConflito: false });
    expect(remarcada.id).toBe(visita.id);
  });
});

describe('RN-20 — oportunidades de retorno', () => {
  async function carroComOSAntiga(diasAtras: number) {
    const base = await cenarioBase();
    const os = await osEntregue(base);
    const quando = new Date(Date.now() - diasAtras * DIA);
    await db.ordemServico.update({ where: { id: os.id }, data: { dataAbertura: quando, dataConclusao: quando } });
    return base;
  }

  it('lista o carro parado há mais de 6 meses', async () => {
    const base = await carroComOSAntiga(240);
    const lista = await alertas.revisaoVencida();
    expect(lista).toHaveLength(1);
    expect(lista[0].placa).toBe(base.carro.placa);
    expect(lista[0].diasSemServico).toBeGreaterThan(180);
    // O telefone precisa vir junto: a lista existe para ligar para o cliente.
    expect(lista[0].cliente.telefone).toBe('11999990000');
  });

  it('carro atendido há pouco não entra', async () => {
    await carroComOSAntiga(30);
    expect(await alertas.revisaoVencida()).toHaveLength(0);
  });

  it('carro que nunca foi atendido não entra — é prospecção, não retorno', async () => {
    await cenarioBase();
    expect(await alertas.revisaoVencida()).toHaveLength(0);
  });

  it('some da lista quando o cliente já tem visita marcada', async () => {
    const base = await carroComOSAntiga(240);
    expect(await alertas.revisaoVencida()).toHaveLength(1);
    await agenda.criar({
      clienteId: base.cliente.id,
      carroId: base.carro.id,
      dataHora: new Date(Date.now() + 3 * DIA).toISOString(),
      tipo: 'REVISAO',
      ignorarConflito: true,
    });
    expect(await alertas.revisaoVencida()).toHaveLength(0);
  });

  it('volta para a lista se a visita for cancelada', async () => {
    const base = await carroComOSAntiga(240);
    const visita = await agenda.criar({
      clienteId: base.cliente.id,
      carroId: base.carro.id,
      dataHora: new Date(Date.now() + 3 * DIA).toISOString(),
      tipo: 'REVISAO',
      ignorarConflito: true,
    });
    expect(await alertas.revisaoVencida()).toHaveLength(0);
    await agenda.excluir(visita.id);
    expect(await alertas.revisaoVencida()).toHaveLength(1);
  });

  it('carro que está na oficina agora não é "retorno"', async () => {
    const base = await carroComOSAntiga(240);
    await ordens.criar(
      { clienteId: base.cliente.id, carroId: base.carro.id, desconto: 0, servicos: [], pecas: [], confirmarSemEstoque: false },
      a.atendente,
    );
    expect(await alertas.revisaoVencida()).toHaveLength(0);
  });
});
