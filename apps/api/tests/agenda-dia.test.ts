import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { db, limparDominio, configPadrao, cenarioBase, atores, DIA, type Base } from './ajuda.js';
import * as agenda from '../src/modules/agenda/agenda.service.js';
import * as orcamentos from '../src/modules/orcamentos/orcamentos.service.js';
import * as ordens from '../src/modules/ordens/ordens.service.js';

// ============================================================
// QUADRO DO DIA — o horário da agenda leva ao atendimento.
//
// Quando o cliente chega, o balcão abre o orçamento (ou a OS) direto do
// horário: ele vira "realizado" e passa a mostrar o número do atendimento.
// ============================================================

let a: Awaited<ReturnType<typeof atores>>;

const horario = (base: Base) =>
  agenda.criar({ clienteId: base.cliente.id, carroId: base.carro.id, dataHora: new Date(Date.now() + DIA).toISOString(), tipo: 'REVISAO', ignorarConflito: true });

const doDia = async (id: string) => (await agenda.listar({})).find((v) => v.id === id)!;

function orcamentoDoHorario(base: Base, visitaId: string) {
  return orcamentos.criar(
    { clienteId: base.cliente.id, carroId: base.carro.id, desconto: 0, servicos: [{ servicoId: base.servico.id, quantidade: 1 }], pecas: [], visitaId },
    a.atendente,
  );
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

describe('o horário leva ao atendimento', () => {
  it('orçamento aberto do horário: o horário fica realizado e mostra o orçamento', async () => {
    const base = await cenarioBase();
    const v = await horario(base);
    const orc = await orcamentoDoHorario(base, v.id);

    const depois = await doDia(v.id);
    expect(depois.status).toBe('REALIZADA');
    expect(depois.orcamento).toEqual({ id: orc.id, numero: orc.numero, os: null });
  });

  it('aprovado o orçamento, o horário mostra também a OS dele', async () => {
    const base = await cenarioBase();
    const v = await horario(base);
    const orc = await orcamentoDoHorario(base, v.id);
    const { os } = await orcamentos.aprovar(orc.id, { confirmarSemEstoque: false }, a.atendente);
    expect((await doDia(v.id)).orcamento?.os).toEqual({ id: os.id, numero: os.numero });
  });

  it('OS direta aberta do horário também liga', async () => {
    const base = await cenarioBase();
    const v = await horario(base);
    const os = await ordens.criar(
      {
        clienteId: base.cliente.id,
        carroId: base.carro.id,
        desconto: 0,
        servicos: [{ servicoId: base.servico.id, quantidade: 1 }],
        pecas: [],
        confirmarSemEstoque: false,
        visitaId: v.id,
      },
      a.atendente,
    );
    const depois = await doDia(v.id);
    expect(depois.os).toEqual({ id: os.id, numero: os.numero });
    expect(depois.status).toBe('REALIZADA');
  });

  it('o horário de outro cliente não aceita o atendimento', async () => {
    const base = await cenarioBase();
    const outro = await cenarioBase();
    const v = await horario(outro);
    await expect(orcamentoDoHorario(base, v.id)).rejects.toThrow(/outro cliente/);
    expect(await db.orcamento.count()).toBe(0);
  });

  it('clicou duas vezes: o horário fica com o primeiro orçamento', async () => {
    const base = await cenarioBase();
    const v = await horario(base);
    const primeiro = await orcamentoDoHorario(base, v.id);
    await orcamentoDoHorario(base, v.id);
    expect((await doDia(v.id)).orcamento?.id).toBe(primeiro.id);
  });

  it('o horário traz o carro inteiro (marca, modelo, ano e placa)', async () => {
    const base = await cenarioBase();
    await db.carro.update({ where: { id: base.carro.id }, data: { ano: 2015 } });
    const v = await horario(base);
    expect((await doDia(v.id)).carro).toEqual({ id: base.carro.id, placa: base.carro.placa, marca: 'VW', modelo: 'Gol', ano: 2015 });
  });
});
