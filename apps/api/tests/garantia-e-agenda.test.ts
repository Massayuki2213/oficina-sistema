import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { db, limparDominio, configPadrao, cenarioBase, donoDeTeste, DIA } from './ajuda.js';
import * as orcamentos from '../src/modules/orcamentos/orcamentos.service.js';
import * as ordens from '../src/modules/ordens/ordens.service.js';
import * as agenda from '../src/modules/agenda/agenda.service.js';
import * as alertas from '../src/modules/alertas/alertas.service.js';

// Regras que protegem o cliente e a agenda: garantia (RN-18), conflito de
// horário (RN-19) e oportunidades de retorno (RN-20).

type Base = Awaited<ReturnType<typeof cenarioBase>>;

async function osEntregue(base: Base) {
  const orc = await orcamentos.createOrcamento({
    clienteId: base.cliente.id,
    carroId: base.carro.id,
    validadeDias: 15,
    desconto: 0,
    observacoes: undefined,
    servicos: [{ servicoId: base.servico.id, quantidade: 1 }],
    pecas: [{ pecaId: base.peca.id, quantidade: 1 }],
  });
  const { os } = await orcamentos.aprovarParaOS(orc.id);
  await ordens.mudarStatus(os.id, 'EM_EXECUCAO');
  await ordens.mudarStatus(os.id, 'CONCLUIDA');
  const dono = await donoDeTeste();
  await ordens.receberPagamento(
    os.id,
    { formaPagamento: 'PIX', parcelas: 1, primeiroVencimentoDias: 30, liberarFiado: false },
    dono.id,
  );
  return os;
}

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

    const { os: gar, origem } = await ordens.abrirGarantia(os.id);

    expect(gar.garantia).toBe(true);
    expect(gar.total).toBe(0);
    expect(gar.pago).toBe(true); // não gera dívida nem entrada no caixa
    expect(origem.numero).toBe(os.numero);

    expect(gar.servicos).toHaveLength(1);
    expect(gar.servicos[0].precoUnit).toBe(0);
    // Peça é custo real e entra pelo fluxo normal — não vem de graça na garantia.
    expect(gar.pecas).toHaveLength(0);
  });

  it('a garantia não mexe no caixa nem no estoque', async () => {
    const base = await cenarioBase({ estoque: 10 });
    const os = await osEntregue(base);

    const estoqueAntes = (await db.peca.findUniqueOrThrow({ where: { id: base.peca.id } })).estoqueAtual;
    const caixaAntes = await db.lancamentoCaixa.count();

    await ordens.abrirGarantia(os.id);

    expect((await db.peca.findUniqueOrThrow({ where: { id: base.peca.id } })).estoqueAtual).toBe(estoqueAntes);
    expect(await db.lancamentoCaixa.count()).toBe(caixaAntes);
    expect(await db.contaReceber.count()).toBe(0);
  });

  it('recusa depois do prazo, com a data do vencimento na mensagem', async () => {
    const base = await cenarioBase();
    const os = await osEntregue(base);
    await db.ordemServico.update({ where: { id: os.id }, data: { dataConclusao: new Date(Date.now() - 40 * DIA) } });

    await expect(ordens.abrirGarantia(os.id)).rejects.toThrow(/garantia de 15 dias venceu/i);
  });

  it('o prazo vem da configuração', async () => {
    await configPadrao({ garantiaDias: 60 });
    const base = await cenarioBase();
    const os = await osEntregue(base);
    await db.ordemServico.update({ where: { id: os.id }, data: { dataConclusao: new Date(Date.now() - 40 * DIA) } });

    const { os: gar } = await ordens.abrirGarantia(os.id);
    expect(gar.garantia).toBe(true);
  });

  it('não abre garantia de uma garantia', async () => {
    const base = await cenarioBase();
    const os = await osEntregue(base);
    const { os: gar } = await ordens.abrirGarantia(os.id);

    await expect(ordens.abrirGarantia(gar.id)).rejects.toThrow(/já é uma garantia/i);
  });

  it('não abre garantia de OS que ainda não terminou', async () => {
    const base = await cenarioBase();
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

    await expect(ordens.abrirGarantia(os.id)).rejects.toThrow(/depois que o serviço foi concluído/i);
  });

  it('a OS de origem passa a listar a garantia aberta', async () => {
    const base = await cenarioBase();
    const os = await osEntregue(base);
    const { os: gar } = await ordens.abrirGarantia(os.id);

    const situacao = await ordens.situacaoGarantia(os.id);
    expect(situacao.garantiasAbertas.map((g) => g.numero)).toContain(gar.numero);
  });
});

describe('RN-19 — conflito de horário', () => {
  const daquiA = (min: number) => new Date(Date.now() + min * 60 * 1000).toISOString();

  async function marcar(base: Base, quando: string, ignorarConflito = false) {
    return agenda.createVisita({
      clienteId: base.cliente.id,
      carroId: base.carro.id,
      dataHora: quando,
      tipo: 'REVISAO',
      observacoes: undefined,
      ignorarConflito,
    });
  }

  it('avisa quando cai na mesma janela', async () => {
    const base = await cenarioBase();
    await marcar(base, daquiA(120));

    await expect(marcar(base, daquiA(135))).rejects.toThrow(/Já existe agendamento nesse horário/i);
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

    const remarcada = await agenda.updateVisita(visita.id, { dataHora: daquiA(125), ignorarConflito: false });
    expect(remarcada.id).toBe(visita.id);
  });
});

describe('RN-20 — oportunidades de retorno', () => {
  async function carroComOSAntiga(diasAtras: number) {
    const base = await cenarioBase();
    const os = await osEntregue(base);
    const quando = new Date(Date.now() - diasAtras * DIA);
    await db.ordemServico.update({
      where: { id: os.id },
      data: { dataAbertura: quando, dataConclusao: quando },
    });
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

    await agenda.createVisita({
      clienteId: base.cliente.id,
      carroId: base.carro.id,
      dataHora: new Date(Date.now() + 3 * DIA).toISOString(),
      tipo: 'REVISAO',
      observacoes: undefined,
      ignorarConflito: true,
    });

    expect(await alertas.revisaoVencida()).toHaveLength(0);
  });

  it('volta para a lista se a visita for cancelada', async () => {
    const base = await carroComOSAntiga(240);
    const visita = await agenda.createVisita({
      clienteId: base.cliente.id,
      carroId: base.carro.id,
      dataHora: new Date(Date.now() + 3 * DIA).toISOString(),
      tipo: 'REVISAO',
      observacoes: undefined,
      ignorarConflito: true,
    });
    expect(await alertas.revisaoVencida()).toHaveLength(0);

    await agenda.deleteVisita(visita.id);
    expect(await alertas.revisaoVencida()).toHaveLength(1);
  });
});
