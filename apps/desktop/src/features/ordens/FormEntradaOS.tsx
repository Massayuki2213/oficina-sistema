import { useState } from 'react';
import type { OrdemServicoDTO } from '@hermes/shared';
import { http } from '../../api/http';
import { deDataHoraLocal, paraDataHoraLocal } from '../../lib/format';
import { numeroParaTexto, textoParaNumero } from '../../lib/mascaras';
import { BtnGhost, BtnPrimary, Campo, Modal, inputCls } from '../../components/ui';
import type { AcaoNaOS } from './api';

/** KM de entrada e previsão de entrega (a queixa e o laudo se editam na própria OS). */
export function FormEntradaOS({ os, executar, onFechar }: { os: OrdemServicoDTO; executar: AcaoNaOS; onFechar: () => void }) {
  const [km, setKm] = useState(numeroParaTexto(os.kmEntrada));
  const [previsao, setPrevisao] = useState(paraDataHoraLocal(os.dataPrevista));
  const [salvando, setSalvando] = useState(false);
  // KM mexe no veículo e só muda com a OS em aberto; a previsão muda sempre.
  const kmEditavel = !os.formaPagamento;

  async function salvar() {
    const kmNovo = textoParaNumero(km);
    const corpo: Record<string, unknown> = { dataPrevista: deDataHoraLocal(previsao), versao: os.versao };
    if (kmEditavel && kmNovo !== os.kmEntrada) corpo.kmEntrada = kmNovo;
    setSalvando(true);
    const r = await executar(() => http.patch<OrdemServicoDTO>(`/ordens/${os.id}`, corpo), { sucesso: 'OS atualizada.' });
    setSalvando(false);
    if (r) onFechar();
  }

  return (
    <Modal
      title={`Entrada do carro — OS #${os.numero}`}
      onClose={onFechar}
      onEnviar={() => void salvar()}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary type="submit" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </BtnPrimary>
        </>
      }
    >
      <Campo
        label="KM na entrada"
        ajuda={
          kmEditavel
            ? `Atualiza o KM do veículo (hoje ${os.carro.kmAtual != null ? `${os.carro.kmAtual.toLocaleString('pt-BR')} km` : 'sem registro'}) — só para frente.`
            : 'Com o pagamento registrado, o KM não muda mais.'
        }
      >
        <input
          inputMode="numeric"
          value={km}
          disabled={!kmEditavel}
          onChange={(e) => setKm(e.target.value.replace(/\D/g, ''))}
          className={`${inputCls} tabular-nums`}
          placeholder="Ex.: 85000"
        />
      </Campo>
      <Campo label="Previsão de entrega" ajuda="Passou da previsão e o carro não saiu, a OS aparece como atrasada.">
        <input type="datetime-local" value={previsao} onChange={(e) => setPrevisao(e.target.value)} className={inputCls} />
      </Campo>
    </Modal>
  );
}
