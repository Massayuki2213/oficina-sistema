import type { PrismaClient, TipoItemEstoque } from '@prisma/client';
import type { CatalogoInicialDTO } from '@hermes/shared';

// ============================================================
// Catálogo inicial — o que quase toda oficina faz e usa, para a
// oficina nova não precisar cadastrar item por item antes do
// primeiro orçamento.
//
// Tudo entra SEM PREÇO, de propósito: um preço inventado aqui iria
// parar no orçamento de um cliente de verdade. O serviço entra com
// mão de obra zero (o balcão digita o valor no orçamento) e a peça
// entra "a definir", com estoque zero (preço estimado no orçamento,
// o Dono acerta pela nota da autopeça).
//
// Carregar de novo não duplica nada: só entra o nome que ainda não
// existe no catálogo (nem desativado).
// ============================================================

/** [nome, categoria, tempo estimado em minutos] */
export const SERVICOS_INICIAIS: [string, string, number | null][] = [
  // Geral
  ['Mão de obra avulsa', 'Geral', null],
  ['Avaliação técnica', 'Geral', 60],
  ['Diagnóstico com scanner', 'Geral', 40],
  ['Revisão preventiva', 'Revisão', 120],
  ['Check-up para viagem', 'Revisão', 60],
  // Motor
  ['Troca de óleo e filtro', 'Motor', 30],
  ['Troca de filtro de ar', 'Motor', 15],
  ['Troca de filtro de combustível', 'Motor', 30],
  ['Troca de filtro de cabine (ar-condicionado)', 'Motor', 20],
  ['Troca de velas de ignição', 'Motor', 40],
  ['Troca de cabos de vela', 'Motor', 30],
  ['Troca de bobina de ignição', 'Motor', 30],
  ['Troca de correia dentada', 'Motor', 180],
  ['Troca de correia do alternador', 'Motor', 45],
  ['Limpeza de bicos injetores', 'Motor', 90],
  ['Limpeza do corpo de borboleta (TBI)', 'Motor', 40],
  ['Troca de junta da tampa de válvulas', 'Motor', 60],
  ['Troca de junta do cabeçote', 'Motor', 480],
  ['Troca de sonda lambda', 'Motor', 40],
  ['Troca de coxim do motor', 'Motor', 60],
  // Arrefecimento
  ['Troca de fluido de arrefecimento', 'Arrefecimento', 45],
  ["Troca de bomba d'água", 'Arrefecimento', 150],
  ['Troca de válvula termostática', 'Arrefecimento', 60],
  ['Troca de mangueiras do radiador', 'Arrefecimento', 60],
  ['Troca de radiador', 'Arrefecimento', 120],
  ['Troca de eletroventilador', 'Arrefecimento', 60],
  // Freios
  ['Troca de pastilhas de freio dianteiras', 'Freios', 60],
  ['Troca de pastilhas de freio traseiras', 'Freios', 60],
  ['Troca de discos e pastilhas dianteiros', 'Freios', 90],
  ['Troca de lonas de freio traseiras', 'Freios', 90],
  ['Troca de fluido de freio (sangria)', 'Freios', 40],
  ['Regulagem do freio de mão', 'Freios', 30],
  // Suspensão e direção
  ['Alinhamento e balanceamento', 'Suspensão', 45],
  ['Troca de amortecedores dianteiros', 'Suspensão', 120],
  ['Troca de amortecedores traseiros', 'Suspensão', 90],
  ['Troca de bandeja de suspensão', 'Suspensão', 90],
  ['Troca de pivô de suspensão', 'Suspensão', 60],
  ['Troca de bieleta', 'Suspensão', 40],
  ['Troca de buchas da suspensão', 'Suspensão', 120],
  ['Troca de rolamento de roda', 'Suspensão', 60],
  ['Troca de terminal de direção', 'Direção', 60],
  ['Troca de barra axial de direção', 'Direção', 60],
  ['Troca de fluido da direção hidráulica', 'Direção', 40],
  // Transmissão
  ['Troca de kit de embreagem', 'Transmissão', 240],
  ['Troca de cabo de embreagem', 'Transmissão', 40],
  ['Troca de óleo do câmbio', 'Transmissão', 40],
  ['Troca de junta homocinética', 'Transmissão', 90],
  ['Troca de coifa da homocinética', 'Transmissão', 60],
  // Elétrica
  ['Troca de bateria', 'Elétrica', 15],
  ['Teste de bateria e alternador', 'Elétrica', 20],
  ['Troca de lâmpadas', 'Elétrica', 15],
  ['Troca de motor de partida', 'Elétrica', 90],
  ['Troca de alternador', 'Elétrica', 90],
  ['Revisão do sistema elétrico', 'Elétrica', 60],
  // Conforto
  ['Higienização do ar-condicionado', 'Conforto', 40],
  ['Recarga de gás do ar-condicionado', 'Conforto', 60],
  ['Troca de palhetas do limpador', 'Conforto', 10],
  // Pneus
  ['Rodízio de pneus', 'Pneus', 30],
  ['Montagem de pneu (por roda)', 'Pneus', 15],
  ['Conserto de pneu', 'Pneus', 20],
];

/**
 * [nome, unidade, tipo] — os nomes como a autopeça vende. PRODUTO é o que se
 * vende por medida ou embalagem (óleo, fluido, spray); PEÇA, o resto. A peça
 * que muda de carro para carro (filtro, pastilha, amortecedor) fica genérica:
 * a aplicação vai na lista para a autopeça (placa, ano, chassi).
 */
export const PECAS_INICIAIS: [string, string, TipoItemEstoque][] = [
  // Óleos e fluidos
  ['Óleo de motor 0W20 sintético', 'L', 'PRODUTO'],
  ['Óleo de motor 5W30 sintético', 'L', 'PRODUTO'],
  ['Óleo de motor 5W40 sintético', 'L', 'PRODUTO'],
  ['Óleo de motor 10W40 semissintético', 'L', 'PRODUTO'],
  ['Óleo de motor 15W40 mineral', 'L', 'PRODUTO'],
  ['Óleo de motor 20W50 mineral', 'L', 'PRODUTO'],
  ['Óleo de câmbio 75W80', 'L', 'PRODUTO'],
  ['Óleo de câmbio 75W90', 'L', 'PRODUTO'],
  ['Fluido ATF (câmbio automático e direção)', 'L', 'PRODUTO'],
  ['Fluido de freio DOT 3 500 ml', 'un', 'PRODUTO'],
  ['Fluido de freio DOT 4 500 ml', 'un', 'PRODUTO'],
  ['Aditivo para radiador concentrado 1 L', 'un', 'PRODUTO'],
  ['Gás refrigerante R-134a', 'kg', 'PRODUTO'],
  ['Higienizador de ar-condicionado', 'un', 'PRODUTO'],
  ['Limpador de bicos e TBI (spray)', 'un', 'PRODUTO'],
  ['Desengripante spray 300 ml', 'un', 'PRODUTO'],
  ['Limpa-contato spray 300 ml', 'un', 'PRODUTO'],
  ['Graxa multiuso 500 g', 'un', 'PRODUTO'],
  ['Material de consumo (estopa, abraçadeira, fita)', 'un', 'PRODUTO'],
  // Filtros e ignição
  ['Filtro de óleo', 'un', 'PECA'],
  ['Filtro de ar do motor', 'un', 'PECA'],
  ['Filtro de combustível', 'un', 'PECA'],
  ['Filtro de cabine (ar-condicionado)', 'un', 'PECA'],
  ['Vela de ignição', 'un', 'PECA'],
  ['Jogo de cabos de vela', 'jg', 'PECA'],
  ['Bobina de ignição', 'un', 'PECA'],
  // Freios
  ['Pastilha de freio dianteira', 'jg', 'PECA'],
  ['Pastilha de freio traseira', 'jg', 'PECA'],
  ['Disco de freio dianteiro', 'par', 'PECA'],
  ['Disco de freio traseiro', 'par', 'PECA'],
  ['Lona de freio traseira', 'jg', 'PECA'],
  ['Tambor de freio', 'un', 'PECA'],
  ['Cilindro de roda', 'un', 'PECA'],
  ['Cilindro mestre de freio', 'un', 'PECA'],
  ['Flexível de freio', 'un', 'PECA'],
  ['Kit reparo da pinça de freio', 'kit', 'PECA'],
  ['Cabo do freio de mão', 'un', 'PECA'],
  // Suspensão
  ['Amortecedor dianteiro', 'un', 'PECA'],
  ['Amortecedor traseiro', 'un', 'PECA'],
  ['Kit batente e coifa do amortecedor', 'kit', 'PECA'],
  ['Coxim do amortecedor dianteiro', 'un', 'PECA'],
  ['Mola helicoidal', 'un', 'PECA'],
  ['Bandeja de suspensão', 'un', 'PECA'],
  ['Pivô de suspensão', 'un', 'PECA'],
  ['Bucha da bandeja', 'un', 'PECA'],
  ['Bieleta', 'un', 'PECA'],
  ['Bucha da barra estabilizadora', 'un', 'PECA'],
  ['Rolamento de roda dianteira', 'un', 'PECA'],
  ['Cubo de roda traseira com rolamento', 'un', 'PECA'],
  // Direção
  ['Terminal de direção', 'un', 'PECA'],
  ['Barra axial de direção', 'un', 'PECA'],
  ['Coifa da caixa de direção', 'un', 'PECA'],
  ['Bomba de direção hidráulica', 'un', 'PECA'],
  // Motor e correias
  ['Kit correia dentada com tensor', 'kit', 'PECA'],
  ['Correia do alternador (poli-V)', 'un', 'PECA'],
  ['Tensor da correia do alternador', 'un', 'PECA'],
  ['Junta da tampa de válvulas', 'un', 'PECA'],
  ['Junta do cabeçote', 'un', 'PECA'],
  ['Retentor do virabrequim', 'un', 'PECA'],
  ['Bico injetor', 'un', 'PECA'],
  ['Sonda lambda', 'un', 'PECA'],
  ['Sensor de rotação', 'un', 'PECA'],
  ['Sensor de temperatura', 'un', 'PECA'],
  ['Coxim do motor', 'un', 'PECA'],
  ['Coxim do câmbio', 'un', 'PECA'],
  // Arrefecimento
  ["Bomba d'água", 'un', 'PECA'],
  ['Válvula termostática', 'un', 'PECA'],
  ['Mangueira superior do radiador', 'un', 'PECA'],
  ['Mangueira inferior do radiador', 'un', 'PECA'],
  ['Reservatório de expansão', 'un', 'PECA'],
  ['Tampa do reservatório de expansão', 'un', 'PECA'],
  ['Eletroventilador do radiador', 'un', 'PECA'],
  ['Radiador', 'un', 'PECA'],
  // Embreagem e transmissão
  ['Kit de embreagem (platô, disco e rolamento)', 'kit', 'PECA'],
  ['Cabo de embreagem', 'un', 'PECA'],
  ['Cilindro auxiliar da embreagem', 'un', 'PECA'],
  ['Junta homocinética', 'un', 'PECA'],
  ['Kit coifa da homocinética', 'kit', 'PECA'],
  // Elétrica
  ['Bateria 45 Ah', 'un', 'PECA'],
  ['Bateria 60 Ah', 'un', 'PECA'],
  ['Bateria 70 Ah', 'un', 'PECA'],
  ['Lâmpada H1 12V 55W', 'un', 'PECA'],
  ['Lâmpada H4 12V 60/55W', 'un', 'PECA'],
  ['Lâmpada H7 12V 55W', 'un', 'PECA'],
  ['Lâmpada H11 12V 55W', 'un', 'PECA'],
  ['Lâmpada pingo T10 12V 5W', 'un', 'PECA'],
  ['Lâmpada 1 polo 12V 21W', 'un', 'PECA'],
  ['Lâmpada 2 polos 12V 21/5W', 'un', 'PECA'],
  ['Fusível lâmina', 'un', 'PECA'],
  ['Relé auxiliar 12V', 'un', 'PECA'],
  ['Regulador de voltagem do alternador', 'un', 'PECA'],
  ['Motor de partida', 'un', 'PECA'],
  ['Alternador', 'un', 'PECA'],
  // Limpador e ar-condicionado
  ['Palheta do limpador 16"', 'un', 'PECA'],
  ['Palheta do limpador 18"', 'un', 'PECA'],
  ['Palheta do limpador 20"', 'un', 'PECA'],
  ['Palheta do limpador 22"', 'un', 'PECA'],
  ['Palheta do limpador 24"', 'un', 'PECA'],
  ['Filtro secador do ar-condicionado', 'un', 'PECA'],
  ['Válvula de expansão do ar-condicionado', 'un', 'PECA'],
];

const chave = (nome: string) => nome.trim().toLocaleLowerCase('pt-BR');

/** Põe no catálogo o que ainda não está lá. Devolve quantos entraram e quantos já existiam. */
export async function carregarCatalogoInicial(db: PrismaClient): Promise<CatalogoInicialDTO> {
  return db.$transaction(async (tx) => {
    const servicosExistentes = new Set((await tx.servico.findMany({ select: { nome: true } })).map((s) => chave(s.nome)));
    const pecasExistentes = new Set((await tx.peca.findMany({ select: { nome: true } })).map((p) => chave(p.nome)));

    const servicosNovos = SERVICOS_INICIAIS.filter(([nome]) => !servicosExistentes.has(chave(nome)));
    const pecasNovas = PECAS_INICIAIS.filter(([nome]) => !pecasExistentes.has(chave(nome)));

    await tx.servico.createMany({
      data: servicosNovos.map(([nome, categoria, tempoEstimadoMin]) => ({ nome, categoria, tempoEstimadoMin, precoMaoDeObra: 0 })),
    });
    await tx.peca.createMany({
      data: pecasNovas.map(([nome, unidade, tipo]) => ({ nome, unidade, tipo, precoCusto: 0, precoVenda: 0, precoADefinir: true })),
    });

    return {
      servicos: { criados: servicosNovos.length, jaExistiam: SERVICOS_INICIAIS.length - servicosNovos.length },
      pecas: { criados: pecasNovas.length, jaExistiam: PECAS_INICIAIS.length - pecasNovas.length },
    };
  });
}
