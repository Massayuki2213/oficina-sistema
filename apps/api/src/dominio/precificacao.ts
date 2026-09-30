import type { Prisma, PrismaClient } from '@prisma/client';
import type { UsuarioSessao } from '@hermes/shared';
import { multiplicar, num, percentual, somar, subtrair } from '../lib/dinheiro.js';
import { AppError, COD, invalido, semPermissao } from '../lib/errors.js';
import { registrar } from '../lib/auditoria.js';
import {
  emMinutos,
  limparFalhasSenhaDono,
  registrarFalhaSenhaDono,
  segundosDeBloqueioSenhaDono,
} from '../lib/tentativas.js';
import { getOficina } from '../modules/oficina/oficina.service.js';
import { conferirSenhaDeDono } from '../modules/auth/auth.service.js';

// ============================================================
// Precificação — o mesmo cálculo para orçamento, OS e venda.
//
//  RN-05: o preço vem do catálogo, mas pode ser combinado na hora.
//  RN-09: total = mão de obra + peças − desconto.
//  RN-08: desconto acima do teto configurado exige a senha do Dono.
//
// O desconto que o teto enxerga é o EFETIVO: quanto o total ficou
// abaixo do preço de tabela — venha ele do campo "desconto" ou de
// baixar o preço de um item. Senão, bastaria baixar o preço da peça
// para passar por cima da regra.
// ============================================================

type Db = Prisma.TransactionClient | PrismaClient;

export interface EntradaServico {
  servicoId: string;
  quantidade: number;
  precoUnit?: number;
}
export interface EntradaPeca {
  pecaId: string;
  quantidade: number;
  precoUnit?: number;
}

export interface ServicoPrecificado {
  servicoId: string;
  nome: string;
  quantidade: number;
  precoUnit: number;
  precoCatalogo: number;
  subtotal: number;
}
export interface PecaPrecificada {
  pecaId: string;
  nome: string;
  unidade: string;
  quantidade: number;
  precoUnit: number;
  precoCatalogo: number;
  subtotal: number;
}

export interface Precificacao {
  servicos: ServicoPrecificado[];
  pecas: PecaPrecificada[];
  /** Soma com os preços praticados. */
  subtotal: number;
  /** Soma com os preços de tabela — a base do teto de desconto. */
  subtotalCatalogo: number;
}

/**
 * Busca o catálogo e "congela" o preço de cada item.
 * Item informado com preço diferente da tabela exige permissão de desconto.
 */
export async function precificar(
  db: Db,
  entrada: { servicos: EntradaServico[]; pecas: EntradaPeca[] },
  ator: UsuarioSessao,
): Promise<Precificacao> {
  const [servicos, pecas] = await Promise.all([
    entrada.servicos.length
      ? db.servico.findMany({ where: { id: { in: entrada.servicos.map((s) => s.servicoId) } } })
      : Promise.resolve([]),
    entrada.pecas.length
      ? db.peca.findMany({ where: { id: { in: entrada.pecas.map((p) => p.pecaId) } } })
      : Promise.resolve([]),
  ]);
  const servPorId = new Map(servicos.map((s) => [s.id, s]));
  const pecaPorId = new Map(pecas.map((p) => [p.id, p]));

  const precoCombinado = (catalogo: number, informado: number | undefined) => {
    if (informado === undefined || informado === catalogo) return catalogo;
    if (!ator.permissoes.darDesconto) throw semPermissao('Seu perfil não pode alterar o preço dos itens.');
    return informado;
  };

  const servicosOut = entrada.servicos.map((s): ServicoPrecificado => {
    const cat = servPorId.get(s.servicoId);
    if (!cat || !cat.ativo) throw invalido('Um dos serviços não está mais no catálogo. Remova-o e escolha de novo.');
    const precoCatalogo = num(cat.precoMaoDeObra);
    const precoUnit = precoCombinado(precoCatalogo, s.precoUnit);
    return {
      servicoId: cat.id,
      nome: cat.nome,
      quantidade: s.quantidade,
      precoUnit,
      precoCatalogo,
      subtotal: multiplicar(precoUnit, s.quantidade),
    };
  });

  const pecasOut = entrada.pecas.map((p): PecaPrecificada => {
    const cat = pecaPorId.get(p.pecaId);
    if (!cat || !cat.ativo) throw invalido('Uma das peças não está mais no estoque. Remova-a e escolha de novo.');
    const precoCatalogo = num(cat.precoVenda);
    const precoUnit = precoCombinado(precoCatalogo, p.precoUnit);
    return {
      pecaId: cat.id,
      nome: cat.nome,
      unidade: cat.unidade,
      quantidade: p.quantidade,
      precoUnit,
      precoCatalogo,
      subtotal: multiplicar(precoUnit, p.quantidade),
    };
  });

  return {
    servicos: servicosOut,
    pecas: pecasOut,
    subtotal: somar(...servicosOut.map((s) => s.subtotal), ...pecasOut.map((p) => p.subtotal)),
    subtotalCatalogo: somar(
      ...servicosOut.map((s) => multiplicar(s.precoCatalogo, s.quantidade)),
      ...pecasOut.map((p) => multiplicar(p.precoCatalogo, p.quantidade)),
    ),
  };
}

/**
 * RN-08 — confere o teto de desconto.
 *
 * A permissão `darDesconto` diz QUEM pode dar desconto; esta regra diz
 * QUANTO se dá sozinho. Acima do teto, precisa da senha de um Dono —
 * a não ser que quem está lançando já seja o Dono.
 */
export async function conferirTetoDeDesconto(
  subtotalCatalogo: number,
  total: number,
  ator: UsuarioSessao,
  senhaDono?: string,
) {
  const descontoEfetivo = subtrair(subtotalCatalogo, total);
  if (descontoEfetivo <= 0 || ator.perfil === 'DONO') return;

  const { descontoMaxSemSenha } = await getOficina();
  const pct = percentual(descontoEfetivo, subtotalCatalogo);
  if (pct <= descontoMaxSemSenha + 1e-9) return;

  const resumo = `Desconto de ${pct.toFixed(1).replace('.', ',')}% passa do limite de ${descontoMaxSemSenha}%`;
  if (!senhaDono) {
    throw new AppError(403, `${resumo}. Peça a senha do Dono para autorizar.`, COD.SENHA_DONO_NECESSARIA);
  }

  // A senha do Dono é a do login dele: errar em série é tentar adivinhá-la.
  const bloqueado = segundosDeBloqueioSenhaDono(ator.id);
  if (bloqueado) {
    throw new AppError(
      429,
      `Muitas tentativas erradas da senha do Dono. Tente de novo em ${emMinutos(bloqueado)}.`,
      COD.MUITAS_TENTATIVAS,
    );
  }
  if (!(await conferirSenhaDeDono(senhaDono))) {
    registrarFalhaSenhaDono(ator.id);
    // A operação é recusada e o hook de auditoria só grava sucesso: sem esta
    // linha, as tentativas não deixariam rastro nenhum no Histórico.
    await registrar({ usuarioId: ator.id, acao: 'SENHA_DONO_INCORRETA', entidade: 'auth', detalhes: resumo });
    throw new AppError(403, 'Senha do Dono incorreta.', COD.SENHA_DONO_INCORRETA);
  }
  limparFalhasSenhaDono(ator.id);
}

/**
 * RN-09 — fecha as contas: o desconto nunca passa do subtotal (total nunca
 * fica negativo) e o teto da RN-08 é conferido sobre o desconto efetivo.
 */
export async function fecharTotal(
  precos: Pick<Precificacao, 'subtotal' | 'subtotalCatalogo'>,
  descontoPedido: number,
  ator: UsuarioSessao,
  senhaDono?: string,
) {
  if (descontoPedido > 0 && !ator.permissoes.darDesconto) throw semPermissao('Seu perfil não pode dar desconto.');
  const desconto = Math.min(descontoPedido, precos.subtotal);
  const total = subtrair(precos.subtotal, desconto);
  await conferirTetoDeDesconto(precos.subtotalCatalogo, total, ator, senhaDono);
  return { subtotal: precos.subtotal, desconto, total };
}
