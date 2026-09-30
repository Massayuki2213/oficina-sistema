import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { FornecedorDTO } from '@hermes/shared';
import { ApiError, http, mensagemDeErro } from '../../api/http';
import { useAvisos } from '../../lib/avisos';
import { mascaraCpfCnpj, mascaraTelefone } from '../../lib/mascaras';
import { AreaTexto, BtnGhost, BtnPrimary, Campo, ErroFormulario, Modal, inputCls } from '../../components/ui';

export function FormFornecedor({
  fornecedor,
  nomeInicial = '',
  onFechar,
  onSalvo,
}: {
  fornecedor: FornecedorDTO | null;
  nomeInicial?: string;
  onFechar: () => void;
  onSalvo?: (f: FornecedorDTO) => void;
}) {
  const qc = useQueryClient();
  const avisos = useAvisos();
  const [f, setF] = useState({
    nome: fornecedor?.nome ?? nomeInicial,
    cnpj: mascaraCpfCnpj(fornecedor?.cnpj),
    contato: fornecedor?.contato ?? '',
    telefone: mascaraTelefone(fornecedor?.telefone),
    email: fornecedor?.email ?? '',
    prazoEntrega: fornecedor?.prazoEntrega != null ? String(fornecedor.prazoEntrega) : '',
    observacoes: fornecedor?.observacoes ?? '',
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function salvar() {
    const corpo = { ...f, prazoEntrega: f.prazoEntrega ? Number(f.prazoEntrega) : null };
    setEnviando(true);
    setErros({});
    try {
      const r = fornecedor ? await http.put<FornecedorDTO>(`/fornecedores/${fornecedor.id}`, { ...corpo, versao: fornecedor.versao }) : await http.post<FornecedorDTO>('/fornecedores', corpo);
      await qc.invalidateQueries({ queryKey: ['fornecedores'] });
      avisos.sucesso(fornecedor ? 'Distribuidor atualizado.' : `${r.nome} cadastrado.`);
      onSalvo?.(r);
      onFechar();
    } catch (e) {
      if (e instanceof ApiError && e.erros) setErros(Object.fromEntries(Object.entries(e.erros).map(([k, v]) => [k, v[0]])));
      else setErros({ geral: mensagemDeErro(e) });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      title={fornecedor ? `Editar ${fornecedor.nome}` : 'Novo distribuidor'}
      size="lg"
      onClose={onFechar}
      onEnviar={() => void salvar()}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary type="submit" disabled={enviando}>
            {enviando ? 'Salvando...' : 'Salvar'}
          </BtnPrimary>
        </>
      }
    >
      <div className="grid sm:grid-cols-[1fr_14rem] gap-3">
        <Campo label="Nome" erro={erros.nome}>
          <input value={f.nome} onChange={(e) => set('nome', e.target.value)} className={inputCls} maxLength={120} />
        </Campo>
        <Campo label="CNPJ" erro={erros.cnpj}>
          <input value={f.cnpj} onChange={(e) => set('cnpj', mascaraCpfCnpj(e.target.value))} className={inputCls} />
        </Campo>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Campo label="Vendedor / contato" erro={erros.contato}>
          <input value={f.contato} onChange={(e) => set('contato', e.target.value)} className={inputCls} maxLength={80} />
        </Campo>
        <Campo label="Telefone / WhatsApp" erro={erros.telefone}>
          <input inputMode="tel" value={f.telefone} onChange={(e) => set('telefone', mascaraTelefone(e.target.value))} className={inputCls} />
        </Campo>
        <Campo label="Prazo de entrega (dias)" erro={erros.prazoEntrega}>
          <input
            inputMode="numeric"
            value={f.prazoEntrega}
            onChange={(e) => set('prazoEntrega', e.target.value.replace(/\D/g, '').slice(0, 3))}
            className={inputCls}
          />
        </Campo>
      </div>
      <Campo label="E-mail" erro={erros.email}>
        <input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} className={inputCls} />
      </Campo>
      <Campo label="Observações" erro={erros.observacoes}>
        <AreaTexto value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} rows={2} maxLength={500} />
      </Campo>
      <ErroFormulario>{erros.geral}</ErroFormulario>
    </Modal>
  );
}
