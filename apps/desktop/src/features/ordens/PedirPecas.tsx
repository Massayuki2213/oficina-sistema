import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckSquare, Copy, Square } from 'lucide-react';
import { formatarQtd, type FornecedorDTO, type OrdemServicoDTO } from '@hermes/shared';
import { http } from '../../api/http';
import { useOficina } from '../../api/catalogo';
import { useAvisos } from '../../lib/avisos';
import { dataBR } from '../../lib/format';
import { linkWhatsApp, mensagens } from '../../lib/whatsapp';
import { BtnGhost, BtnWhatsApp, Campo, Modal, Selecao } from '../../components/ui';
import type { AcaoNaOS } from './api';

// ============================================================
// A lista das peças encomendadas, pronta para a autopeça (RN-03).
//
// O Dono escolhe a autopeça e manda pelo WhatsApp. O que ela não tiver,
// ele desmarca da próxima vez e manda o resto para outra — a lista vai
// diminuindo. A peça só sai de vez quando a compra dela é lançada.
// ============================================================

export function PedirPecas({ os, executar, onFechar }: { os: OrdemServicoDTO; executar: AcaoNaOS; onFechar: () => void }) {
  const oficina = useOficina();
  const avisos = useAvisos();
  const fornecedores = useQuery({ queryKey: ['fornecedores'], queryFn: () => http.get<FornecedorDTO[]>('/fornecedores') });

  const aPedir = os.pecas.filter((p) => p.aPedir);
  // Começa marcado o que ninguém pediu ainda; se tudo já foi pedido, tudo.
  const [marcadas, setMarcadas] = useState(() => {
    const novas = aPedir.filter((p) => !p.pedido);
    return new Set((novas.length ? novas : aPedir).map((p) => p.id));
  });
  const [fornecedorId, setFornecedorId] = useState('');

  const fornecedor = fornecedores.data?.find((f) => f.id === fornecedorId);
  const itens = aPedir.filter((p) => marcadas.has(p.id));
  const texto = fornecedor && itens.length ? mensagens.pedidoPecas(os, itens, fornecedor, oficina) : '';
  const link = fornecedor && itens.length ? linkWhatsApp(fornecedor.telefone, texto) : null;

  const alternar = (id: string) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /** Anota na OS para quem a lista foi — e fecha a janela. */
  async function registrar() {
    const r = await executar(() => http.post<OrdemServicoDTO>(`/ordens/${os.id}/pedir-pecas`, { fornecedorId, itens: [...marcadas] }), {
      sucesso: `Lista anotada como pedida a ${fornecedor?.nome}.`,
      invalidar: [['compras']],
    });
    if (r) onFechar();
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      avisos.erro('Não consegui copiar. Selecione o texto da lista e copie à mão.');
      return;
    }
    await registrar();
  }

  return (
    <Modal
      title={`Pedir peças — OS #${os.numero}`}
      size="lg"
      onClose={onFechar}
      semConfirmarDescarte
      footer={
        <>
          <BtnGhost onClick={onFechar}>Fechar</BtnGhost>
          <BtnGhost icone={Copy} onClick={() => void copiar()} disabled={!texto}>
            Copiar lista
          </BtnGhost>
          <BtnWhatsApp href={link} onClick={() => void registrar()}>
            Enviar no WhatsApp
          </BtnWhatsApp>
        </>
      }
    >
      {aPedir.length === 0 ? (
        <p className="text-sm text-grafite/65">Nenhuma peça desta OS está esperando pedido.</p>
      ) : (
        <>
          <Campo label="Autopeça" ajuda={fornecedores.data?.length === 0 ? 'Cadastre a autopeça em Distribuidores.' : undefined}>
            <Selecao value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
              <option value="">— escolha —</option>
              {(fornecedores.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                  {f.telefone ? '' : ' (sem telefone)'}
                </option>
              ))}
            </Selecao>
          </Campo>
          {fornecedor && !fornecedor.telefone && (
            <p className="text-xs text-amarelo font-bold -mt-1.5">Esta autopeça está sem WhatsApp no cadastro: use "Copiar lista".</p>
          )}

          <div className="border border-linha rounded-xl divide-y divide-linha">
            {aPedir.map((p) => {
              const marcada = marcadas.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  role="checkbox"
                  aria-checked={marcada}
                  onClick={() => alternar(p.id)}
                  className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-fundo"
                >
                  <span className={`mt-0.5 shrink-0 ${marcada ? 'text-laranja' : 'text-grafite/30'}`}>
                    {marcada ? <CheckSquare size={18} /> : <Square size={18} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-bold">
                      {formatarQtd(p.encomenda, p.unidade)} — {p.nome}
                    </span>
                    {p.pedido && (
                      <span className="block text-xs text-grafite/50">
                        já pedida a {p.pedido.fornecedor.nome} em {dataBR(p.pedido.em)}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-grafite/50 -mt-1.5">Desmarque o que esta autopeça não tem: depois mande o resto para outra.</p>

          {texto && (
            <Campo label="Mensagem">
              <div className="whitespace-pre-wrap text-sm rounded-lg border border-linha bg-fundo px-3 py-2 select-all">{texto}</div>
            </Campo>
          )}
        </>
      )}
    </Modal>
  );
}
