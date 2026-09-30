import type { ReactNode } from 'react';
import { Keyboard, LifeBuoy } from 'lucide-react';
import { VERSAO } from '@hermes/shared';
import { useSessao } from '../acesso/sessao';
import { PageHeader } from '../../components/ui';

// Ajuda escrita para quem está no balcão — curta, no idioma da oficina.

const ATALHOS: [string, string][] = [
  ['F2 ou Ctrl+K', 'Buscar pela placa, de qualquer tela'],
  ['Enter', 'Salvar a janela aberta (formulários)'],
  ['Esc', 'Fechar a janela (pergunta antes se você digitou algo)'],
  ['↑ ↓ e Enter', 'Escolher na lista de busca (cliente, peça, serviço)'],
];

interface Pergunta {
  p: string;
  r: ReactNode;
  /** Só aparece para quem usa aquilo. */
  para?: 'balcao' | 'financeiro' | 'mecanico';
}

const PERGUNTAS: Pergunta[] = [
  {
    p: 'O cliente só quer saber o preço. Preciso cadastrar ele?',
    r: 'Não. Use o orçamento "Rápido": só um nome e o carro, sem cadastro. Se ele aprovar, o sistema pede o cadastro na hora de abrir a OS — e aproveita o que você já digitou.',
    para: 'balcao',
  },
  {
    p: 'Como o orçamento vira Ordem de Serviço?',
    r: 'Abra o orçamento e clique em "Aprovar e abrir OS" (ou "Aprovar → OS" direto na lista). A OS nasce com os mesmos itens e preços, e as peças já saem do estoque.',
    para: 'balcao',
  },
  {
    p: 'Faltou peça no estoque. E agora?',
    r: 'O sistema avisa e pergunta se é para seguir mesmo assim (encomenda). Confirmando, a OS fica "aguardando peça". Quando a peça chegar, dê entrada em Estoque ou lance a compra — e retome a OS.',
    para: 'balcao',
  },
  {
    p: 'Como recebo um pagamento dividido (parte PIX, parte fiado)?',
    r: 'Na OS concluída, clique em "Receber pagamento". Lance o que foi pago na hora (dá para dividir em até 3 formas) e, se sobrar valor, escolha Fiado ou Parcelado. O que foi pago entra no caixa na hora; o resto vira parcela em Contas a receber.',
    para: 'balcao',
  },
  {
    p: 'Registrei o pagamento errado. Como desfaço?',
    r: 'O Dono abre a OS, vai em "Mais" → "Estornar pagamento" e informa o motivo. O dinheiro sai do caixa como estorno (nada é apagado) e a OS volta para "Concluída", esperando o pagamento certo.',
  },
  {
    p: 'Por que o sistema pediu a senha do Dono?',
    r: 'O desconto (ou o preço combinado) passou do limite que a oficina configurou. O Dono digita a senha ali mesmo para autorizar — e fica registrado no Histórico.',
    para: 'balcao',
  },
  {
    p: 'Cliente com fiado atrasado pode levar fiado de novo?',
    r: 'O sistema bloqueia e mostra quanto está vencido. Se mesmo assim for liberar, confirme — a decisão fica registrada no Histórico. Pagamento à vista nunca é bloqueado.',
    para: 'balcao',
  },
  {
    p: 'O carro voltou com o mesmo problema. Cobro de novo?',
    r: 'Se estiver dentro do prazo de garantia, abra a OS original e use "Mais" → "Abrir garantia". A nova OS refaz a mão de obra sem cobrar; peça nova entra normalmente.',
    para: 'balcao',
  },
  {
    p: 'Sou mecânico. O que eu faço no sistema?',
    r: 'Em Ordens de Serviço você vê as suas OS e as que ainda não têm ninguém ("Assumir"). Dentro da OS: marque os serviços feitos, lance e tire peças, escreva o laudo e mude o andamento (iniciar, aguardando peça, concluir). A entrega e o dinheiro ficam com o balcão.',
    para: 'mecanico',
  },
  {
    p: 'Como confiro o caixa no fim do dia?',
    r: 'Livro-caixa → "Fechamento do dia". Ele separa as entradas por forma: conte a gaveta (Dinheiro), confira o extrato (PIX) e bata com a maquininha (Cartão).',
    para: 'financeiro',
  },
  {
    p: 'Aporte e retirada entram no lucro?',
    r: 'Não. Aporte é dinheiro que o dono colocou; retirada é dinheiro que o dono tirou. Os dois aparecem no caixa, mas ficam fora do faturamento e das despesas — o relatório mostra o lucro real da oficina.',
    para: 'financeiro',
  },
  {
    p: 'E se o computador da oficina queimar?',
    r: 'O sistema faz backup automático todo dia. Mesmo assim, em Configurações → Backup, baixe uma cópia de vez em quando para um pendrive ou para a nuvem: backup só no mesmo computador não protege de roubo ou incêndio.',
    para: 'financeiro',
  },
];

export default function AjudaPage() {
  const { pode } = useSessao();
  const visivel = (q: Pergunta) =>
    !q.para || (q.para === 'balcao' && pode('atender')) || (q.para === 'financeiro' && pode('verFinanceiro')) || (q.para === 'mecanico' && !pode('atender'));

  return (
    <div className="max-w-4xl">
      <PageHeader title="Ajuda" subtitle={`Hermes ${VERSAO}`} />
      <div className="grid md:grid-cols-[1fr_18rem] gap-5 items-start">
        <section className="bg-white rounded-2xl border border-linha shadow-sm">
          <h2 className="flex items-center gap-2 px-5 py-3.5 border-b border-linha font-extrabold text-petroleo">
            <LifeBuoy size={18} /> Perguntas frequentes
          </h2>
          <div className="divide-y divide-linha">
            {PERGUNTAS.filter(visivel).map((q) => (
              <details key={q.p} className="group px-5 py-3.5">
                <summary className="cursor-pointer font-bold text-sm text-petroleo list-none flex items-start gap-2">
                  <span className="text-laranja group-open:rotate-90 transition inline-block">›</span>
                  {q.p}
                </summary>
                <p className="text-sm text-grafite/70 mt-2 ml-4 leading-relaxed">{q.r}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="bg-white rounded-2xl border border-linha shadow-sm">
          <h2 className="flex items-center gap-2 px-5 py-3.5 border-b border-linha font-extrabold text-petroleo">
            <Keyboard size={18} /> Atalhos
          </h2>
          <div className="p-4 space-y-3">
            {ATALHOS.map(([tecla, oque]) => (
              <div key={tecla} className="text-sm">
                <kbd className="inline-block font-mono text-xs font-bold border border-linha border-b-2 rounded px-1.5 py-0.5 bg-fundo">{tecla}</kbd>
                <div className="text-grafite/65 mt-1">{oque}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
