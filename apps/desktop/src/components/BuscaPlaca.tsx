import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Car, Phone, AlertTriangle, ShieldCheck, UserPlus, FileText, X, ClipboardList } from 'lucide-react';
import { brl, placaValida, normalizarPlaca, type FichaVeiculoDTO } from '@hermes/shared';
import { ApiError, http, mensagemDeErro } from '../api/http';
import { useSessao } from '../features/acesso/sessao';
import { dataBR, formatarTelefone, LABEL_STATUS_OS, CORES_STATUS_OS } from '../lib/format';
import { mascaraPlaca } from '../lib/mascaras';
import { Badge, Placa } from './ui';

// ============================================================
// Busca por placa — a porta de entrada do atendimento (RN-16/17).
//
// A seção 6 do PLANEJAMENTO começa o fluxo aqui: "cliente chega →
// atendente busca pela PLACA". Por isso ela mora na barra de cima,
// visível de qualquer tela. F2 ou Ctrl+K põem o cursor nela.
// ============================================================

export function BuscaPlaca() {
  const navegar = useNavigate();
  const { pode } = useSessao();
  const [placa, setPlaca] = useState('');
  const [aberto, setAberto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<FichaVeiculoDTO | null>(null);
  const [naoAchou, setNaoAchou] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const campo = useRef<HTMLInputElement>(null);

  // No balcão a mão não sai do teclado.
  useEffect(() => {
    function atalho(e: KeyboardEvent) {
      if (e.key === 'F2' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        campo.current?.focus();
        campo.current?.select();
      }
    }
    window.addEventListener('keydown', atalho);
    return () => window.removeEventListener('keydown', atalho);
  }, []);

  async function buscar() {
    const limpa = normalizarPlaca(placa);
    if (!placaValida(limpa)) {
      setErro('Placa incompleta — use o formato ABC1234 ou ABC1D23');
      setAberto(true);
      return;
    }
    setBuscando(true);
    setErro('');
    setNaoAchou(null);
    setResultado(null);
    setAberto(true);
    try {
      setResultado(await http.get<FichaVeiculoDTO>(`/carros/placa/${encodeURIComponent(limpa)}`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNaoAchou(limpa);
      else setErro(mensagemDeErro(e));
    } finally {
      setBuscando(false);
    }
  }

  function fechar() {
    setAberto(false);
    setResultado(null);
    setNaoAchou(null);
    setErro('');
  }

  function irPara(destino: string) {
    fechar();
    setPlaca('');
    navegar(destino);
  }

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void buscar();
        }}
        className="flex items-center gap-2 bg-fundo border border-linha rounded-xl px-3 py-2 w-full max-w-[19rem] focus-within:border-laranja focus-within:bg-white transition"
      >
        <Search size={16} className="text-grafite/40 shrink-0" />
        <input
          ref={campo}
          value={placa}
          onChange={(e) => setPlaca(mascaraPlaca(e.target.value))}
          placeholder="Buscar pela placa..."
          aria-label="Buscar veículo pela placa"
          className="flex-1 min-w-0 outline-none text-sm bg-transparent font-mono tracking-wider uppercase placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
        />
        {placa ? (
          <button type="button" onClick={() => setPlaca('')} aria-label="Limpar" className="text-grafite/40 hover:text-grafite shrink-0">
            <X size={15} />
          </button>
        ) : (
          <kbd className="hidden lg:block text-[10px] font-bold text-grafite/30 border border-linha rounded px-1.5 py-0.5 shrink-0">F2</kbd>
        )}
      </form>

      {aberto && (
        <Painel onFechar={fechar}>
          {buscando && <div className="py-10 text-center text-grafite/40 text-sm">Procurando {placa}...</div>}

          {erro && (
            <div className="py-8 text-center">
              <AlertTriangle size={26} className="text-vermelho mx-auto mb-2" />
              <div className="font-bold text-petroleo">{erro}</div>
            </div>
          )}

          {naoAchou && (
            <div className="py-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-fundo grid place-items-center mx-auto mb-3 text-grafite/40">
                <Car size={26} />
              </div>
              <div className="font-extrabold text-petroleo text-lg">Placa {mascaraPlaca(naoAchou)} não cadastrada</div>
              <p className="text-sm text-grafite/50 mt-1 mb-4">Primeira vez deste carro na oficina?</p>
              {pode('cadastrarClientes') && (
                <button
                  onClick={() => irPara(`/veiculos?novo=1&placa=${naoAchou}`)}
                  className="inline-flex items-center gap-2 bg-laranja hover:bg-laranja-deep text-white font-bold px-4 py-2.5 rounded-xl shadow"
                >
                  <UserPlus size={16} /> Cadastrar veículo
                </button>
              )}
            </div>
          )}

          {resultado && <Ficha r={resultado} onIr={irPara} />}
        </Painel>
      )}
    </>
  );
}

/** Folha que desce sob a barra de cima, sem tirar o atendente da tela em que estava. */
function Painel({ children, onFechar }: { children: React.ReactNode; onFechar: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFechar]);

  return (
    <div className="fixed inset-0 z-40 bg-petroleo/40" onClick={onFechar}>
      <div
        role="dialog"
        aria-label="Ficha do veículo"
        className="absolute left-1/2 -translate-x-1/2 top-[72px] w-[min(46rem,calc(100vw-1.5rem))] max-h-[calc(100vh-6rem)] overflow-y-auto bg-white rounded-2xl shadow-2xl border border-linha"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}

function Ficha({ r, onIr }: { r: FichaVeiculoDTO; onIr: (destino: string) => void }) {
  const { pode } = useSessao();
  const telefone = r.cliente.whatsapp ?? r.cliente.telefone;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="w-12 h-12 rounded-xl bg-petroleo text-white grid place-items-center shrink-0">
          <Car size={24} />
        </div>
        <div className="flex-1 min-w-[12rem]">
          <div className="flex items-center gap-2 flex-wrap">
            <Placa placa={r.placa} grande />
            <span className="text-lg font-extrabold text-petroleo">
              {r.marca} {r.modelo}
            </span>
            {!r.ativo && <Badge cor="bg-vermelho-bg text-vermelho">excluído do cadastro</Badge>}
          </div>
          <div className="text-sm text-grafite/50 mt-0.5">
            {[r.ano, r.cor, r.kmAtual != null ? `${r.kmAtual.toLocaleString('pt-BR')} km` : null].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
      </div>

      {/* O dono e a situação dele — é o que o atendente precisa antes de falar. */}
      <div className="bg-fundo rounded-xl p-3.5 flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[12rem]">
          {pode('cadastrarClientes') ? (
            <button onClick={() => onIr(`/clientes?abrir=${r.cliente.id}`)} className="font-bold text-petroleo hover:underline text-left">
              {r.cliente.nome}
            </button>
          ) : (
            <span className="font-bold text-petroleo">{r.cliente.nome}</span>
          )}
          {telefone && (
            <div className="text-sm text-grafite/60 flex items-center gap-1.5 mt-0.5">
              <Phone size={13} /> {formatarTelefone(telefone)}
            </div>
          )}
        </div>
        {r.fiado?.bloqueado && (
          <div className="bg-vermelho-bg text-vermelho rounded-lg px-3 py-2 text-sm font-bold flex items-center gap-2">
            <AlertTriangle size={15} />
            Deve {brl(r.fiado.vencido)} em atraso
          </div>
        )}
      </div>

      <div>
        <div className="text-[11px] font-bold uppercase tracking-wide text-grafite/40 mb-1.5">
          Histórico do veículo {r.historico.length > 0 && `· ${r.historico.length} atendimento(s)`}
        </div>

        {r.historico.length === 0 ? (
          <div className="text-sm text-grafite/40 py-4 text-center bg-fundo rounded-xl">Nenhum serviço registrado neste carro ainda.</div>
        ) : (
          <div className="border border-linha rounded-xl divide-y divide-linha overflow-hidden">
            {r.historico.map((o) => (
              <button
                key={o.id}
                onClick={() => onIr(`/ordens?abrir=${o.id}`)}
                className="w-full text-left flex items-start gap-3 px-3.5 py-2.5 hover:bg-fundo/60"
              >
                <div className="text-xs font-mono font-bold text-grafite/40 pt-0.5 w-10 shrink-0">#{o.numero}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{o.servicos.length > 0 ? o.servicos.join(', ') : 'Sem serviço lançado'}</div>
                  <div className="text-xs text-grafite/50">
                    {dataBR(o.dataAbertura)}
                    {o.kmEntrada != null && ` · ${o.kmEntrada.toLocaleString('pt-BR')} km`}
                    {o.mecanico && ` · ${o.mecanico}`}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold tabular-nums">{o.garantia ? '—' : brl(o.total)}</div>
                  <div className="flex items-center gap-1 justify-end mt-0.5">
                    {o.garantia && (
                      <span title="Garantia" className="text-azul">
                        <ShieldCheck size={13} />
                      </span>
                    )}
                    <Badge cor={CORES_STATUS_OS[o.status]}>{LABEL_STATUS_OS[o.status]}</Badge>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {pode('atender') && r.ativo && (
        <div className="grid sm:grid-cols-2 gap-2.5">
          <button
            onClick={() => onIr(`/ordens?nova=1&carro=${r.id}`)}
            className="inline-flex items-center justify-center gap-2 bg-laranja hover:bg-laranja-deep text-white font-bold px-4 py-3 rounded-xl shadow shadow-laranja/30"
          >
            <ClipboardList size={17} /> Abrir OS agora
          </button>
          <button
            onClick={() => onIr(`/orcamentos?novo=1&carro=${r.id}`)}
            className="inline-flex items-center justify-center gap-2 border-[1.6px] border-linha text-petroleo font-bold px-4 py-3 rounded-xl hover:bg-fundo"
          >
            <FileText size={17} /> Fazer orçamento
          </button>
        </div>
      )}
    </div>
  );
}
