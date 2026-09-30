import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import {
  brl,
  formatarQtd,
  LABEL_FORMA_PAGAMENTO,
  LABEL_STATUS_OS,
  type OficinaDTO,
  type OrcamentoDTO,
  type OrdemServicoDTO,
} from '@hermes/shared';
import { useOficina } from '../api/catalogo';
import { dataBR, dataHoraBR, formatarDocumento, formatarPlaca, formatarTelefone } from '../lib/format';

// ============================================================
// Documento para imprimir ou salvar em PDF (orçamento e OS).
// Renderizado num portal fora do app: na impressão só a folha sai
// (o CSS @media print esconde o resto). "Salvar como PDF" é a opção
// da própria janela de impressão do Windows/Electron.
// ============================================================

export function DocumentoImpressao({ onFechar, children }: { onFechar: () => void; children: ReactNode }) {
  return createPortal(
    <div className="doc-print-root fixed inset-0 z-[60] bg-grafite/70 overflow-y-auto" onClick={onFechar}>
      <div className="nao-imprimir sticky top-0 z-10 flex items-center justify-end gap-2 px-4 py-3 bg-grafite/90 backdrop-blur">
        <span className="mr-auto text-white/70 text-sm hidden sm:block">Para gerar PDF, escolha "Salvar como PDF" na impressão.</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            window.print();
          }}
          className="inline-flex items-center gap-1.5 bg-laranja hover:bg-laranja-deep text-white font-bold px-4 py-2 rounded-lg shadow"
        >
          <Printer size={16} /> Imprimir / Salvar PDF
        </button>
        <button onClick={onFechar} className="inline-flex items-center gap-1.5 text-white/80 hover:text-white font-bold px-4 py-2 rounded-lg border border-white/30">
          <X size={16} /> Fechar
        </button>
      </div>
      <div className="folha max-w-[820px] mx-auto my-6 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-10 text-grafite text-[13px]">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function linhaContato(o: OficinaDTO) {
  return [formatarTelefone(o.telefone), o.email, o.endereco, o.cnpj ? `CNPJ ${formatarDocumento(o.cnpj)}` : null].filter(Boolean).join(' · ');
}

function Cabecalho({ titulo, numero, data, extra }: { titulo: string; numero: number; data: string; extra?: string }) {
  const oficina = useOficina();
  const contato = linhaContato(oficina);
  return (
    <div className="flex items-start justify-between gap-6 border-b-2 border-petroleo pb-4 mb-5">
      <div className="flex items-center gap-4 min-w-0">
        {oficina.logo && <img src={oficina.logo} alt="" className="h-14 w-auto max-w-[140px] object-contain shrink-0" />}
        <div className="min-w-0">
          <div className="text-2xl font-extrabold text-petroleo tracking-wide">{oficina.nome}</div>
          {oficina.subtitulo && <div className="text-xs text-grafite/60">{oficina.subtitulo}</div>}
          {contato && <div className="text-xs text-grafite/60">{contato}</div>}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-lg font-extrabold text-petroleo">{titulo}</div>
        <div className="text-sm font-bold">Nº {numero}</div>
        <div className="text-xs text-grafite/60">{data}</div>
        {extra && <div className="text-xs text-grafite/60">{extra}</div>}
      </div>
    </div>
  );
}

function Partes({
  cliente,
  veiculo,
}: {
  cliente: { nome: string; telefone?: string | null; documento?: string | null };
  veiculo: { titulo: string; detalhe?: string } | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-6 mb-4">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-grafite/45 mb-1">Cliente</div>
        <div className="font-bold">{cliente.nome}</div>
        {cliente.telefone && <div className="text-grafite/70">{formatarTelefone(cliente.telefone)}</div>}
        {cliente.documento && <div className="text-grafite/70">{formatarDocumento(cliente.documento)}</div>}
      </div>
      {veiculo && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-grafite/45 mb-1">Veículo</div>
          <div className="font-bold">{veiculo.titulo}</div>
          {veiculo.detalhe && <div className="text-grafite/70">{veiculo.detalhe}</div>}
        </div>
      )}
    </div>
  );
}

interface Linha {
  nome: string;
  quantidade: number;
  unidade?: string;
  precoUnit: number;
  subtotal: number;
}

function TabelaItens({ titulo, itens }: { titulo: string; itens: Linha[] }) {
  if (itens.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="text-[10px] font-bold uppercase tracking-wide text-grafite/45 mb-1">{titulo}</div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-grafite/30 text-[11px] text-grafite/55">
            <th className="py-1 text-left font-bold">Descrição</th>
            <th className="py-1 text-center font-bold w-20">Qtd</th>
            <th className="py-1 text-right font-bold w-24">Unit.</th>
            <th className="py-1 text-right font-bold w-28">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((i, k) => (
            <tr key={k} className="border-b border-grafite/10">
              <td className="py-1.5">{i.nome}</td>
              <td className="py-1.5 text-center tabular-nums">{formatarQtd(i.quantidade, i.unidade)}</td>
              <td className="py-1.5 text-right tabular-nums">{brl(i.precoUnit)}</td>
              <td className="py-1.5 text-right tabular-nums font-semibold">{brl(i.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Totais({ subtotal, desconto, total }: { subtotal: number; desconto: number; total: number }) {
  return (
    <div className="flex flex-col items-end gap-0.5 mt-4 pt-3 border-t border-grafite/20">
      {desconto > 0 && (
        <>
          <div className="text-grafite/60">
            Subtotal: <span className="tabular-nums">{brl(subtotal)}</span>
          </div>
          <div className="text-vermelho">
            Desconto: −<span className="tabular-nums">{brl(desconto)}</span>
          </div>
        </>
      )}
      <div className="text-xl font-extrabold text-petroleo">
        Total: <span className="tabular-nums">{brl(total)}</span>
      </div>
    </div>
  );
}

function Texto({ titulo, children }: { titulo: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <div className="mt-3">
      <div className="text-[10px] font-bold uppercase tracking-wide text-grafite/45 mb-0.5">{titulo}</div>
      <div className="whitespace-pre-line">{children}</div>
    </div>
  );
}

function Rodape({ assinatura }: { assinatura: string }) {
  const oficina = useOficina();
  return (
    <>
      {oficina.observacoesDocumento && <div className="mt-5 text-[11px] text-grafite/60 whitespace-pre-line">{oficina.observacoesDocumento}</div>}
      <div className="mt-14 pt-1 border-t border-grafite/40 w-72 mx-auto text-center text-xs text-grafite/60">{assinatura}</div>
    </>
  );
}

export function OrcamentoDoc({ orc }: { orc: OrcamentoDTO }) {
  const cliente = orc.cliente
    ? { nome: orc.cliente.nome, telefone: orc.cliente.whatsapp ?? orc.cliente.telefone, documento: orc.cliente.cpfCnpj }
    : { nome: orc.contatoNome || 'Consumidor', telefone: orc.contatoTelefone };
  const veiculo = orc.carro
    ? {
        titulo: `${orc.carro.marca} ${orc.carro.modelo}`,
        detalhe: [`Placa ${formatarPlaca(orc.carro.placa)}`, orc.carro.ano, orc.carro.kmAtual != null ? `${orc.carro.kmAtual.toLocaleString('pt-BR')} km` : null]
          .filter(Boolean)
          .join(' · '),
      }
    : orc.veiculoDescricao
      ? { titulo: orc.veiculoDescricao, detalhe: 'não cadastrado' }
      : null;

  return (
    <>
      <Cabecalho titulo="ORÇAMENTO" numero={orc.numero} data={dataBR(orc.data)} extra={`válido até ${dataBR(orc.validade)}`} />
      <Partes cliente={cliente} veiculo={veiculo} />
      <TabelaItens titulo="Serviços (mão de obra)" itens={orc.servicos} />
      <TabelaItens titulo="Peças e produtos" itens={orc.pecas} />
      <Totais subtotal={orc.subtotal} desconto={orc.desconto} total={orc.total} />
      <Texto titulo="Observações">{orc.observacoes}</Texto>
      <div className="mt-4 text-[11px] text-grafite/55">
        Orçamento válido até {dataBR(orc.validade)}. Valores podem mudar após a verificação do veículo, sempre com a sua aprovação.
      </div>
      <Rodape assinatura="Aprovação do cliente" />
    </>
  );
}

export function OSDoc({ os }: { os: OrdemServicoDTO }) {
  const pagamento = os.formaPagamento
    ? os.formaPagamento === 'MISTO'
      ? os.pagamentos
          .filter((p) => p.tipo === 'ENTRADA')
          .map((p) => `${p.forma ? LABEL_FORMA_PAGAMENTO[p.forma] : ''} ${brl(p.valor)}`)
          .concat(os.aReceber > 0 ? [`a prazo ${brl(os.aReceber)}`] : [])
          .join(' + ')
      : LABEL_FORMA_PAGAMENTO[os.formaPagamento]
    : os.total === 0
      ? 'Sem cobrança'
      : 'Em aberto';

  return (
    <>
      <Cabecalho
        titulo={os.garantia ? 'OS — GARANTIA' : 'ORDEM DE SERVIÇO'}
        numero={os.numero}
        data={`Entrada ${dataHoraBR(os.dataAbertura)}`}
        extra={os.dataPrevista ? `Previsão ${dataHoraBR(os.dataPrevista)}` : undefined}
      />
      <Partes
        cliente={{ nome: os.cliente.nome, telefone: os.cliente.whatsapp ?? os.cliente.telefone, documento: os.cliente.cpfCnpj }}
        veiculo={{
          titulo: `${os.carro.marca} ${os.carro.modelo}`,
          detalhe: [`Placa ${formatarPlaca(os.carro.placa)}`, os.carro.ano, os.kmEntrada != null ? `KM de entrada ${os.kmEntrada.toLocaleString('pt-BR')}` : null]
            .filter(Boolean)
            .join(' · '),
        }}
      />
      <div className="flex flex-wrap gap-x-6 gap-y-1 mb-3">
        <div>
          <span className="text-grafite/55">Situação: </span>
          <b>{LABEL_STATUS_OS[os.status]}</b>
        </div>
        {os.mecanico && (
          <div>
            <span className="text-grafite/55">Mecânico: </span>
            <b>{os.mecanico.nome}</b>
          </div>
        )}
        <div>
          <span className="text-grafite/55">Pagamento: </span>
          <b>{pagamento}</b>
        </div>
        {os.osOrigem && (
          <div>
            <span className="text-grafite/55">Garantia da OS </span>
            <b>#{os.osOrigem.numero}</b>
          </div>
        )}
      </div>
      <Texto titulo="Reclamação do cliente">{os.defeitoRelatado}</Texto>
      <div className="mt-3" />
      <TabelaItens titulo="Serviços (mão de obra)" itens={os.servicos} />
      <TabelaItens titulo="Peças e produtos" itens={os.pecas} />
      <Totais subtotal={os.subtotal} desconto={os.desconto} total={os.total} />
      <Texto titulo="Laudo / observações">{os.observacoes}</Texto>
      {os.parcelas.filter((p) => p.status !== 'CANCELADA').length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-grafite/45 mb-0.5">Parcelas</div>
          {os.parcelas
            .filter((p) => p.status !== 'CANCELADA')
            .map((p) => (
              <div key={p.id} className="tabular-nums">
                {p.parcela}/{p.totalParcelas} — vence {dataBR(p.vencimento)} — {brl(p.valor)}
                {p.status === 'PAGA' ? ' (paga)' : ''}
              </div>
            ))}
        </div>
      )}
      <Rodape assinatura="Assinatura do cliente na retirada" />
    </>
  );
}
