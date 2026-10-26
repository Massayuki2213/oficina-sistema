import { useState } from 'react';
import type { PecaDTO } from '@hermes/shared';
import { ApiError, http, mensagemDeErro } from '../../api/http';
import { useAcao } from '../../api/acoes';
import { BtnGhost, BtnPrimary, Campo, ErroFormulario, InputDinheiro, Modal, inputCls } from '../../components/ui';

/**
 * Peça que ainda não está cadastrada, no meio do orçamento ou da OS: o balcão
 * informa só o nome e um preço estimado para a linha. Custo e preço de tabela
 * ficam com o Dono, quando chegar a nota da autopeça.
 */
export function PecaRapida({
  nomeInicial = '',
  onFechar,
  onSalvo,
}: {
  nomeInicial?: string;
  onFechar: () => void;
  /** `estimado`: o preço da linha, em reais. */
  onSalvo: (p: PecaDTO, estimado: number) => void;
}) {
  const [form, setForm] = useState({ nome: nomeInicial, unidade: 'un', estimado: '' });
  const [erros, setErros] = useState<Record<string, string[]>>({});
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const salvar = useAcao(() => http.post<PecaDTO>('/pecas/rapida', { nome: form.nome, unidade: form.unidade || 'un' }), {
    invalidar: [['pecas']],
    erro: 'silencioso',
  });

  function enviar() {
    if (!form.estimado || Number(form.estimado) <= 0) return setErros({ estimado: ['Informe o preço estimado para o orçamento'] });
    setErros({});
    salvar.mutate(undefined, {
      onSuccess: (p) => onSalvo(p, Number(form.estimado)),
      onError: (e) => setErros(e instanceof ApiError && e.erros ? e.erros : { _: [mensagemDeErro(e)] }),
    });
  }

  return (
    <Modal
      title="Peça nova"
      onClose={onFechar}
      onEnviar={enviar}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary type="submit" disabled={salvar.isPending}>
            {salvar.isPending ? 'Salvando...' : 'Cadastrar e adicionar'}
          </BtnPrimary>
        </>
      }
    >
      <p className="text-sm text-grafite/65 leading-snug">
        A peça entra com o preço estimado. O Dono acerta o preço de verdade pela nota da autopeça, antes de receber.
      </p>
      <Campo label="Nome da peça" erro={erros.nome?.[0]}>
        <input value={form.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex.: Bomba de combustível Gol 1.6" className={inputCls} />
      </Campo>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Preço estimado (cada)" erro={erros.estimado?.[0]}>
          <InputDinheiro value={form.estimado} onChange={(v) => set('estimado', v)} />
        </Campo>
        <Campo label="Unidade" erro={erros.unidade?.[0]}>
          <input value={form.unidade} onChange={(e) => set('unidade', e.target.value)} className={inputCls} maxLength={10} list="unidades-peca" />
        </Campo>
      </div>
      <datalist id="unidades-peca">
        {['un', 'jg', 'par', 'kit', 'L', 'm'].map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <ErroFormulario>{erros._?.[0]}</ErroFormulario>
    </Modal>
  );
}
