import type { OficinaDTO, OrcamentoDTO, OrdemServicoDTO, ParcelaDTO, RevisaoVencidaDTO, VisitaDTO } from '@hermes/shared';
import { brl, formatarQtd, soDigitos } from '@hermes/shared';
import { dataBR, horaBR } from './format';
import { mascaraPlaca } from './mascaras';

// ============================================================
// WhatsApp sem API paga: um link wa.me com a mensagem pronta.
// Clicou, abre o WhatsApp (Web ou do computador) já na conversa,
// com o texto escrito — o atendente só confere e aperta enviar.
// ============================================================

/** Link do WhatsApp, ou null se o telefone não serve (sem DDD). */
export function linkWhatsApp(telefone: string | null | undefined, texto: string): string | null {
  const d = soDigitos(telefone ?? '');
  if (d.length < 10) return null;
  const numero = d.length >= 12 && d.startsWith('55') ? d : `55${d}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

const primeiroNome = (nome: string) => nome.split(' ')[0];
const veiculo = (c: { modelo: string; placa: string } | null | undefined) => (c ? `${c.modelo} (${mascaraPlaca(c.placa)})` : 'veículo');

export const mensagens = {
  orcamento(o: OrcamentoDTO, oficina: OficinaDTO) {
    const nome = o.cliente?.nome ?? o.contatoNome;
    const linhas = [
      ...o.servicos.map((s) => `• ${s.nome}${s.quantidade > 1 ? ` (${s.quantidade}x)` : ''} — ${brl(s.subtotal)}`),
      ...o.pecas.map((p) => `• ${p.nome} (${formatarQtd(p.quantidade, p.unidade)}) — ${brl(p.subtotal)}`),
    ];
    return [
      `Olá${nome ? `, ${primeiroNome(nome)}` : ''}! Segue o orçamento nº ${o.numero} da ${oficina.nome}` +
        (o.carro ? ` para o ${veiculo(o.carro)}` : o.veiculoDescricao ? ` para o ${o.veiculoDescricao}` : '') +
        ':',
      '',
      ...linhas,
      '',
      ...(o.desconto > 0 ? [`Desconto: −${brl(o.desconto)}`] : []),
      `*Total: ${brl(o.total)}* (válido até ${dataBR(o.validade)}).`,
      '',
      'Qualquer dúvida é só chamar. Para aprovar, responda esta mensagem.',
    ].join('\n');
  },

  osPronta(os: OrdemServicoDTO, oficina: OficinaDTO) {
    return (
      `Olá, ${primeiroNome(os.cliente.nome)}! Seu ${veiculo(os.carro)} está pronto aqui na ${oficina.nome}. ` +
      `O total ficou em ${brl(os.total)}. Pode vir buscar quando quiser!`
    );
  },

  cobranca(p: ParcelaDTO, oficina: OficinaDTO) {
    const origem = p.os ? ` (OS nº ${p.os.numero})` : '';
    const quando = p.emAtraso ? `que venceu em ${dataBR(p.vencimento)}` : `que vence em ${dataBR(p.vencimento)}`;
    return (
      `Olá, ${primeiroNome(p.cliente.nome)}! Tudo bem? Aqui é da ${oficina.nome}. ` +
      `Passando para lembrar da parcela ${p.parcela}/${p.totalParcelas} de ${brl(p.saldo)}${origem}, ${quando}. ` +
      'Qualquer coisa é só chamar!'
    );
  },

  retorno(r: RevisaoVencidaDTO, oficina: OficinaDTO) {
    const meses = Math.max(6, Math.floor(r.diasSemServico / 30));
    return (
      `Olá, ${primeiroNome(r.cliente.nome)}! Aqui é da ${oficina.nome}. Faz uns ${meses} meses que o seu ${r.modelo} ` +
      'passou por aqui. Que tal agendar uma revisão? Assim a gente evita surpresa na estrada.'
    );
  },

  lembreteVisita(v: VisitaDTO, oficina: OficinaDTO) {
    return (
      `Olá, ${primeiroNome(v.cliente.nome)}! Confirmando seu horário na ${oficina.nome}: ` +
      `${dataBR(v.dataHora)} às ${horaBR(v.dataHora)}${v.carro ? `, com o ${v.carro.modelo}` : ''}. Até lá!`
    );
  },
};
