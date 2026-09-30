import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import type { OrdemServicoDTO, SituacaoGarantiaDTO } from '@hermes/shared';
import { http, mensagemDeErro } from '../../api/http';
import { useEquipe } from '../../api/catalogo';
import { useAvisos } from '../../lib/avisos';
import { dataBR } from '../../lib/format';
import { AreaTexto, BtnGhost, BtnPrimary, Campo, ErroFormulario, Modal, Selecao } from '../../components/ui';

/**
 * RN-18 — o carro voltou dentro do prazo pelo mesmo problema. Nasce uma
 * OS nova, ligada a esta, que refaz a mão de obra sem cobrar.
 */
export function AbrirGarantia({ os, onFechar, onAberta }: { os: OrdemServicoDTO; onFechar: () => void; onAberta: (id: string) => void }) {
  const qc = useQueryClient();
  const avisos = useAvisos();
  const equipe = useEquipe('MECANICO');
  const situacao = useQuery({
    queryKey: ['ordens', os.id, 'garantia'],
    queryFn: () => http.get<SituacaoGarantiaDTO>(`/ordens/${os.id}/garantia`),
  });
  const [mecanicoId, setMecanicoId] = useState(os.mecanico?.id ?? '');
  const [defeito, setDefeito] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  async function abrir() {
    setEnviando(true);
    setErro('');
    try {
      const r = await http.post<{ os: OrdemServicoDTO }>(`/ordens/${os.id}/garantia`, {
        mecanicoId: mecanicoId || null,
        defeitoRelatado: defeito.trim() || null,
      });
      await qc.invalidateQueries({ queryKey: ['ordens'] });
      avisos.sucesso(`OS de garantia #${r.os.numero} aberta.`);
      onAberta(r.os.id);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  const s = situacao.data;
  return (
    <Modal
      title={`Garantia da OS #${os.numero}`}
      onClose={onFechar}
      onEnviar={() => void abrir()}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Voltar</BtnGhost>
          <BtnPrimary type="submit" icone={ShieldCheck} disabled={enviando || !s?.elegivel}>
            {enviando ? 'Abrindo...' : 'Abrir OS de garantia'}
          </BtnPrimary>
        </>
      }
    >
      {s && (
        <div className="bg-azul-bg text-azul rounded-xl px-3.5 py-2.5 text-sm font-semibold">
          Garantia até {dataBR(s.garantiaAte)} ({s.diasRestantes} dia(s) restantes).
          {s.garantiasAbertas.length > 0 && (
            <span className="block font-normal">Já houve retorno: {s.garantiasAbertas.map((g) => `#${g.numero}`).join(', ')}.</span>
          )}
        </div>
      )}
      <p className="text-sm text-grafite/65 leading-snug">
        A nova OS repete os serviços desta <strong>sem cobrar a mão de obra</strong>. Se precisar de peça nova, ela entra normalmente na OS de garantia
        (sai do estoque, como qualquer peça).
      </p>
      <Campo label="Mecânico">
        <Selecao value={mecanicoId} onChange={(e) => setMecanicoId(e.target.value)}>
          <option value="">— ninguém ainda —</option>
          {(equipe.data ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Campo label="O que o cliente relatou agora">
        <AreaTexto value={defeito} onChange={(e) => setDefeito(e.target.value)} placeholder={`Retorno em garantia da OS #${os.numero}`} maxLength={1000} />
      </Campo>
      <ErroFormulario>{erro}</ErroFormulario>
    </Modal>
  );
}
