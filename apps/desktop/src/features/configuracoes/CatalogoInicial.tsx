import { ListPlus } from 'lucide-react';
import type { CatalogoInicialDTO } from '@hermes/shared';
import { http } from '../../api/http';
import { useAcao } from '../../api/acoes';
import { BtnPrimary } from '../../components/ui';

/**
 * Serviços e peças que quase toda oficina usa, sem preço: a mão de obra é
 * digitada no orçamento e a peça entra "a definir". Aparece com o catálogo
 * vazio (Serviços, Estoque) e fica em Configurações para depois. Carregar de
 * novo só acrescenta o que falta.
 */
export function CatalogoInicial() {
  const carregar = useAcao(() => http.post<CatalogoInicialDTO>('/oficina/catalogo-inicial'), {
    invalidar: [['servicos'], ['pecas']],
    sucesso: ({ servicos, pecas }) =>
      (servicos.criados + pecas.criados === 0
        ? 'O catálogo já tinha tudo: nada foi acrescentado.'
        : `Catálogo carregado: ${servicos.criados} serviço(s) e ${pecas.criados} peça(s).`) +
      (pecas.categorizadas > 0 ? ` ${pecas.categorizadas} peça(s) ganharam categoria.` : ''),
  });

  return (
    <section className="bg-white rounded-2xl border border-linha shadow-sm p-5 mb-5 flex items-start gap-4 flex-wrap">
      <ListPlus size={22} className="text-laranja shrink-0 mt-0.5" />
      <div className="flex-1 min-w-[16rem]">
        <h2 className="font-extrabold text-petroleo">Começar com um catálogo pronto</h2>
        <p className="text-sm text-grafite/65 mt-1 leading-relaxed">
          Os serviços e as peças de uso comum nas oficinas (troca de óleo, freios, suspensão, óleos 5W30 e 15W40, lâmpadas H4 e H7, baterias...), já cadastrados. Entram{' '}
          <strong>sem preço</strong>: a mão de obra é digitada no orçamento e a peça fica "a definir" até o Dono acertar pela nota. O que
          já estiver cadastrado não é duplicado.
        </p>
      </div>
      <BtnPrimary icone={ListPlus} onClick={() => carregar.mutate(undefined)} disabled={carregar.isPending}>
        {carregar.isPending ? 'Carregando...' : 'Carregar catálogo inicial'}
      </BtnPrimary>
    </section>
  );
}
