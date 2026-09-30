import { useState } from 'react';
import { LABEL_TIPO_PESSOA, type ClienteDTO, type ClienteResumoDTO } from '@hermes/shared';
import { ApiError, http, mensagemDeErro } from '../../api/http';
import { useAcao } from '../../api/acoes';
import { mascaraCpfCnpj, mascaraTelefone } from '../../lib/mascaras';
import { AreaTexto, BtnGhost, BtnPrimary, Campo, ErroFormulario, Modal, Selecao, inputCls } from '../../components/ui';

type ClienteEditavel = Pick<ClienteDTO, 'id' | 'nome' | 'tipo' | 'cpfCnpj' | 'telefone' | 'whatsapp' | 'email'> &
  Partial<Pick<ClienteDTO, 'endereco' | 'observacoes' | 'versao'>>;

/** Cadastro/edição de cliente. Abre também de dentro da OS e do orçamento. */
export default function FormCliente({
  cliente,
  nomeInicial = '',
  telefoneInicial = '',
  onFechar,
  onSalvo,
}: {
  cliente: ClienteEditavel | null;
  nomeInicial?: string;
  telefoneInicial?: string;
  onFechar: () => void;
  onSalvo: (c: ClienteResumoDTO) => void;
}) {
  const [form, setForm] = useState({
    nome: cliente?.nome ?? nomeInicial,
    tipo: cliente?.tipo ?? 'PF',
    cpfCnpj: mascaraCpfCnpj(cliente?.cpfCnpj),
    telefone: mascaraTelefone(cliente?.telefone ?? telefoneInicial),
    whatsapp: mascaraTelefone(cliente?.whatsapp),
    mesmoWhats: !cliente || !cliente.whatsapp || cliente.whatsapp === cliente.telefone,
    email: cliente?.email ?? '',
    endereco: cliente?.endereco ?? '',
    observacoes: cliente?.observacoes ?? '',
  });
  const [erros, setErros] = useState<Record<string, string[]>>({});
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const salvar = useAcao(
    () => {
      const corpo = {
        nome: form.nome,
        tipo: form.tipo,
        cpfCnpj: form.cpfCnpj,
        telefone: form.telefone,
        whatsapp: form.mesmoWhats ? form.telefone : form.whatsapp,
        email: form.email,
        endereco: form.endereco,
        observacoes: form.observacoes,
      };
      return cliente ? http.put<ClienteDTO>(`/clientes/${cliente.id}`, { ...corpo, versao: cliente.versao }) : http.post<ClienteDTO>('/clientes', corpo);
    },
    { invalidar: [['clientes'], ['carros']], sucesso: (c) => (cliente ? `Cliente "${c.nome}" atualizado.` : `Cliente "${c.nome}" cadastrado.`), erro: 'silencioso' },
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
      title={cliente ? 'Editar cliente' : 'Novo cliente'}
      onClose={onFechar}
      onEnviar={enviar}
      size="lg"
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary type="submit" disabled={salvar.isPending}>
            {salvar.isPending ? 'Salvando...' : 'Salvar cliente'}
          </BtnPrimary>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_12rem] gap-3">
        <Campo label="Nome completo" erro={erros.nome?.[0]}>
          <input value={form.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex: Carlos Andrade" className={inputCls} />
        </Campo>
        <Campo label="Tipo">
          <Selecao value={form.tipo} onChange={(e) => set('tipo', e.target.value as 'PF' | 'PJ')}>
            <option value="PF">{LABEL_TIPO_PESSOA.PF}</option>
            <option value="PJ">{LABEL_TIPO_PESSOA.PJ}</option>
          </Selecao>
        </Campo>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label={form.tipo === 'PJ' ? 'CNPJ' : 'CPF'} erro={erros.cpfCnpj?.[0]} ajuda="Opcional — mas é o que a nota fiscal vai pedir">
          <input
            value={form.cpfCnpj}
            onChange={(e) => set('cpfCnpj', mascaraCpfCnpj(e.target.value))}
            placeholder={form.tipo === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00'}
            className={inputCls}
          />
        </Campo>
        <Campo label="E-mail" erro={erros.email?.[0]}>
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Telefone" erro={erros.telefone?.[0]}>
          <input
            value={form.telefone}
            onChange={(e) => set('telefone', mascaraTelefone(e.target.value))}
            inputMode="numeric"
            placeholder="(11) 98877-1234"
            className={inputCls}
          />
        </Campo>
        <Campo label="WhatsApp" erro={erros.whatsapp?.[0]}>
          {form.mesmoWhats ? (
            <button type="button" onClick={() => set('mesmoWhats', false)} className={`${inputCls} text-left text-grafite/50`}>
              O mesmo do telefone <span className="text-azul font-bold">— trocar</span>
            </button>
          ) : (
            <input
              value={form.whatsapp}
              onChange={(e) => set('whatsapp', mascaraTelefone(e.target.value))}
              inputMode="numeric"
              placeholder="(11) 98877-1234"
              className={inputCls}
            />
          )}
        </Campo>
      </div>
      <Campo label="Endereço" erro={erros.endereco?.[0]}>
        <input value={form.endereco} onChange={(e) => set('endereco', e.target.value)} className={inputCls} />
      </Campo>
      <Campo label="Observações" erro={erros.observacoes?.[0]}>
        <AreaTexto value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} rows={2} />
      </Campo>
      <ErroFormulario>{erros._?.[0]}</ErroFormulario>
    </Modal>
  );
}
