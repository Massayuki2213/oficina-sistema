import { useState } from 'react';
import type { ServicoDTO } from '@hermes/shared';
import { ApiError, http, mensagemDeErro } from '../../api/http';
import { useAcao } from '../../api/acoes';
import { textoParaNumero } from '../../lib/mascaras';
import { BtnGhost, BtnPrimary, Campo, ErroFormulario, InputDinheiro, Modal, inputCls } from '../../components/ui';

/** Cadastro/edição de serviço — usado na tela de Serviços e de dentro do orçamento. */
export default function FormServico({
  servico,
  nomeInicial = '',
  onFechar,
  onSalvo,
}: {
  servico: ServicoDTO | null;
  nomeInicial?: string;
  onFechar: () => void;
  onSalvo: (s: ServicoDTO) => void;
}) {
  const [form, setForm] = useState({
    nome: servico?.nome ?? nomeInicial,
    categoria: servico?.categoria ?? '',
    descricao: servico?.descricao ?? '',
    precoMaoDeObra: servico ? servico.precoMaoDeObra.toFixed(2) : '',
    tempoEstimadoMin: servico?.tempoEstimadoMin != null ? String(servico.tempoEstimadoMin) : '',
  });
  const [erros, setErros] = useState<Record<string, string[]>>({});
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const salvar = useAcao(
    () => {
      const corpo = {
        nome: form.nome,
        categoria: form.categoria,
        descricao: form.descricao,
        precoMaoDeObra: form.precoMaoDeObra === '' ? undefined : Number(form.precoMaoDeObra),
        tempoEstimadoMin: textoParaNumero(form.tempoEstimadoMin),
      };
      return servico ? http.put<ServicoDTO>(`/servicos/${servico.id}`, { ...corpo, versao: servico.versao }) : http.post<ServicoDTO>('/servicos', corpo);
    },
    { invalidar: [['servicos']], sucesso: (s) => (servico ? `Serviço "${s.nome}" atualizado.` : `Serviço "${s.nome}" cadastrado.`), erro: 'silencioso' },
  );

  function enviar() {
    setErros({});
    salvar.mutate(undefined, {
      onSuccess: onSalvo,
      onError: (e) => setErros(e instanceof ApiError && e.erros ? e.erros : { _: [mensagemDeErro(e)] }),
    });
  }

  return (
    <Modal
      title={servico ? 'Editar serviço' : 'Novo serviço'}
      onClose={onFechar}
      onEnviar={enviar}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary type="submit" disabled={salvar.isPending}>
            {salvar.isPending ? 'Salvando...' : 'Salvar serviço'}
          </BtnPrimary>
        </>
      }
    >
      <Campo label="Nome do serviço" erro={erros.nome?.[0]}>
        <input value={form.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex: Troca de óleo + filtro" className={inputCls} />
      </Campo>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Mão de obra" erro={erros.precoMaoDeObra?.[0]}>
          <InputDinheiro value={form.precoMaoDeObra} onChange={(v) => set('precoMaoDeObra', v)} />
        </Campo>
        <Campo label="Tempo estimado (min)" erro={erros.tempoEstimadoMin?.[0]}>
          <input inputMode="numeric" value={form.tempoEstimadoMin} onChange={(e) => set('tempoEstimadoMin', e.target.value.replace(/\D/g, ''))} className={inputCls} />
        </Campo>
      </div>
      <Campo label="Categoria" erro={erros.categoria?.[0]}>
        <input value={form.categoria} onChange={(e) => set('categoria', e.target.value)} placeholder="Motor, Freios, Elétrica..." className={inputCls} list="categorias-servico" />
      </Campo>
      <datalist id="categorias-servico">
        {['Motor', 'Freios', 'Suspensão', 'Elétrica', 'Revisão', 'Conforto', 'Funilaria', 'Pneus'].map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <Campo label="Descrição (opcional)" erro={erros.descricao?.[0]}>
        <input value={form.descricao} onChange={(e) => set('descricao', e.target.value)} className={inputCls} />
      </Campo>
      <ErroFormulario>{erros._?.[0]}</ErroFormulario>
    </Modal>
  );
}
