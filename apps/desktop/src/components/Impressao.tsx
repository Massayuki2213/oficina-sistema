import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Printer } from 'lucide-react';
import { brl, dataBR, LABEL_STATUS_OS, LABEL_FORMA_PAGAMENTO } from '../lib/format';

// Identidade da oficina no cabeçalho do documento.
// (Na Fase 6, isso virá da tela de Configurações.)
const OFICINA = {
  nome: 'OFICINA HERMES',
  subtitulo: 'Serviços automotivos',
  contato: '(11) 0000-0000 · Rua Example, 123 — São Paulo/SP',
};

interface ItemDoc { nome: string; quantidade: number; precoUnit: number }
interface ClienteDoc { nome: string; telefone?: string | null; cpfCnpj?: string | null }
interface CarroDoc { placa: string; marca?: string; modelo: string; ano?: number | null; kmAtual?: number | null }

// Folha do documento + barra de ações (não sai na impressão). Renderizada num
// portal fora do #root para a impressão não trazer o resto do app.
export function DocumentoImpressao({ onFechar, children }: { onFechar: () => void; children: ReactNode }) {
  return createPortal(
    <div className="doc-print-root fixed inset-0 z-[60] bg-grafite/70 overflow-y-auto" onClick={onFechar}>
      <div className="nao-imprimir sticky top-0 z-10 flex items-center justify-end gap-2 px-4 py-3 bg-grafite/90 backdrop-blur">
        <button
          onClick={(e) => { e.stopPropagation(); window.print(); }}
          className="inline-flex items-center gap-1.5 bg-laranja hover:bg-laranja-deep text-white font-bold px-4 py-2 rounded-lg shadow"
        >
          <Printer size={16} /> Imprimir / Salvar PDF
        </button>
        <button onClick={onFechar} className="text-white/80 hover:text-white font-bold px-4 py-2 rounded-lg border border-white/30">
          Fechar
        </button>
      </div>
      <div className="max-w-[820px] mx-auto my-6 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-10 text-grafite">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function Cabecalho({ titulo, numero, data, validade }: { titulo: string; numero: number; data: string; validade?: string }) {
  return (
    <div className="flex items-start justify-between border-b-2 border-petroleo pb-4 mb-6">
      <div>
        <div className="text-2xl font-extrabold text-petroleo tracking-wide">{OFICINA.nome}</div>
        <div className="text-xs text-grafite/60">{OFICINA.subtitulo}</div>
        <div className="text-xs text-grafite/60">{OFICINA.contato}</div>
      </div>
      <div className="text-right">
        <div className="text-lg font-extrabold text-petroleo">{titulo}</div>
        <div className="text-sm font-bold">Nº {numero}</div>
        <div className="text-xs text-grafite/60">
          {data}
          {validade ? ` · válido até ${validade}` : ''}
        </div>
      </div>
    </div>
  );
}

function Partes({ cliente, carro }: { cliente: ClienteDoc; carro?: CarroDoc | null }) {
  return (
    <div className="grid grid-cols-2 gap-6 mb-5 text-sm">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-grafite/40 mb-1">Cliente</div>
        <div className="font-bold">{cliente.nome}</div>
        {cliente.telefone && <div className="text-grafite/70">{cliente.telefone}</div>}
        {cliente.cpfCnpj && <div className="text-grafite/70">{cliente.cpfCnpj}</div>}
      </div>
      {carro && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-grafite/40 mb-1">Veículo</div>
          <div className="font-bold">{carro.marca ? `${carro.marca} ` : ''}{carro.modelo}</div>
          <div className="text-grafite/70">
            Placa {carro.placa}
            {carro.ano ? ` · ${carro.ano}` : ''}
            {carro.kmAtual != null ? ` · ${carro.kmAtual.toLocaleString('pt-BR')} km` : ''}
          </div>
        </div>
      )}
    </div>
  );
}

function TabelaItens({ titulo, itens }: { titulo: string; itens: ItemDoc[] }) {
  if (itens.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-grafite/40 mb-1">{titulo}</div>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-grafite/30 text-xs text-grafite/50">
            <th className="py-1 text-left font-bold">Descrição</th>
            <th className="py-1 text-center font-bold w-14">Qtd</th>
            <th className="py-1 text-right font-bold w-24">Unit.</th>
            <th className="py-1 text-right font-bold w-28">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((i, k) => (
            <tr key={k} className="border-b border-grafite/10">
              <td className="py-1.5">{i.nome}</td>
              <td className="py-1.5 text-center tabular-nums">{i.quantidade}</td>
              <td className="py-1.5 text-right tabular-nums">{brl(i.precoUnit)}</td>
              <td className="py-1.5 text-right tabular-nums font-semibold">{brl(i.quantidade * i.precoUnit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Totais({ subtotal, desconto, total }: { subtotal?: number | null; desconto?: number | null; total: number }) {
  return (
    <div className="flex flex-col items-end gap-0.5 mt-4 pt-3 border-t border-grafite/20 text-sm">
      {subtotal != null && <div className="text-grafite/60">Subtotal: <span className="tabular-nums">{brl(subtotal)}</span></div>}
      {desconto ? <div className="text-vermelho">Desconto: −<span className="tabular-nums">{brl(desconto)}</span></div> : null}
      <div className="text-xl font-extrabold text-petroleo">Total: <span className="tabular-nums">{brl(total)}</span></div>
    </div>
  );
}

function Assinatura({ texto }: { texto: string }) {
  return (
    <div className="mt-14 pt-1 border-t border-grafite/40 w-72 mx-auto text-center text-xs text-grafite/60">{texto}</div>
  );
}

function itensDe(lista: { quantidade: number; precoUnit: number; servico?: { nome: string }; peca?: { nome: string } }[]): ItemDoc[] {
  return lista.map((i) => ({ nome: i.servico?.nome ?? i.peca?.nome ?? '—', quantidade: i.quantidade, precoUnit: i.precoUnit }));
}

// ---- Documento de ORÇAMENTO ----
interface OrcDoc {
  numero: number;
  data: string;
  validade: string;
  subtotal: number;
  desconto: number;
  total: number;
  observacoes?: string | null;
  cliente?: ClienteDoc;
  carro?: CarroDoc | null;
  servicos: { quantidade: number; precoUnit: number; servico?: { nome: string } }[];
  pecas: { quantidade: number; precoUnit: number; peca?: { nome: string } }[];
}
export function OrcamentoDoc({ orc }: { orc: OrcDoc }) {
  return (
    <>
      <Cabecalho titulo="ORÇAMENTO" numero={orc.numero} data={dataBR(orc.data)} validade={dataBR(orc.validade)} />
      <Partes cliente={orc.cliente ?? { nome: '—' }} carro={orc.carro} />
      <TabelaItens titulo="Serviços (mão de obra)" itens={itensDe(orc.servicos)} />
      <TabelaItens titulo="Peças" itens={itensDe(orc.pecas)} />
      <Totais subtotal={orc.subtotal} desconto={orc.desconto} total={orc.total} />
      {orc.observacoes && <div className="mt-4 text-sm text-grafite/70"><b>Observações:</b> {orc.observacoes}</div>}
      <div className="mt-5 text-xs text-grafite/50">Orçamento válido até {dataBR(orc.validade)}. Valores sujeitos a alteração após a verificação do veículo.</div>
      <Assinatura texto="Aprovação do cliente" />
    </>
  );
}

// ---- Documento de ORDEM DE SERVIÇO ----
interface OSDocData {
  numero: number;
  dataAbertura: string;
  status: string;
  total: number;
  pago: boolean;
  formaPagamento?: string | null;
  cliente?: ClienteDoc;
  carro?: CarroDoc | null;
  mecanico?: { nome: string } | null;
  servicos: { quantidade: number; precoUnit: number; servico?: { nome: string } }[];
  pecas: { quantidade: number; precoUnit: number; peca?: { nome: string } }[];
}
export function OSDoc({ os }: { os: OSDocData }) {
  return (
    <>
      <Cabecalho titulo="ORDEM DE SERVIÇO" numero={os.numero} data={dataBR(os.dataAbertura)} />
      <Partes cliente={os.cliente ?? { nome: '—' }} carro={os.carro} />
      <div className="flex gap-6 text-sm mb-4">
        <div><span className="text-grafite/50">Situação: </span><b>{LABEL_STATUS_OS[os.status] ?? os.status}</b></div>
        {os.mecanico?.nome && <div><span className="text-grafite/50">Mecânico: </span><b>{os.mecanico.nome}</b></div>}
        <div>
          <span className="text-grafite/50">Pagamento: </span>
          <b>{os.pago ? `Pago${os.formaPagamento ? ` (${LABEL_FORMA_PAGAMENTO[os.formaPagamento] ?? os.formaPagamento})` : ''}` : 'Em aberto'}</b>
        </div>
      </div>
      <TabelaItens titulo="Serviços (mão de obra)" itens={itensDe(os.servicos)} />
      <TabelaItens titulo="Peças" itens={itensDe(os.pecas)} />
      <Totais total={os.total} />
      <Assinatura texto="Assinatura do cliente na retirada" />
    </>
  );
}
