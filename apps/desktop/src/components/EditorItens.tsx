import { useState } from 'react';
import { X, AlertTriangle, Plus } from 'lucide-react';
import {
  brl,
  formatarQtd,
  multiplicar,
  somar,
  subtrair,
  type ItemPecaDTO,
  type ItemServicoDTO,
  type PecaDTO,
  type ServicoDTO,
} from '@hermes/shared';
import type { ItemPecaInput, ItemServicoInput } from '@hermes/shared/schemas';
import { buscarPecas, buscarServicos } from '../api/catalogo';
import { numeroParaTexto, textoParaNumero, valorParaCentavos } from '../lib/mascaras';
import { BuscaSelect, InputDinheiro, InputQuantidade, Secao } from './ui';
import FormServico from '../features/servicos/FormServico';

// ============================================================
// Linhas de serviço e peça de um formulário (orçamento, OS nova,
// venda de balcão). O estado é local até salvar; a conta de cada
// linha usa a MESMA função de centavos do servidor, então a prévia
// bate com o valor que vai ser gravado.
// ============================================================

export interface LinhaServico {
  servicoId: string;
  nome: string;
  quantidade: string;
  /** Preço combinado ("80.00"); igual ao catálogo quando não mexeram. */
  precoUnit: string;
  precoCatalogo: number;
}

export interface LinhaPeca {
  pecaId: string;
  nome: string;
  unidade: string;
  quantidade: string;
  precoUnit: string;
  precoCatalogo: number;
  estoque: number;
}

export interface Itens {
  servicos: LinhaServico[];
  pecas: LinhaPeca[];
}

export const ITENS_VAZIOS: Itens = { servicos: [], pecas: [] };

const qtd = (l: { quantidade: string }) => textoParaNumero(l.quantidade) ?? 0;
const preco = (l: { precoUnit: string }) => Number(l.precoUnit || 0);

/** Totais da prévia (RN-09), com o desconto nunca passando do subtotal. */
export function calcularTotais(itens: Itens, descontoTexto = '') {
  const linhas = [...itens.servicos, ...itens.pecas];
  const subtotal = somar(...linhas.map((l) => multiplicar(preco(l), qtd(l))));
  const subtotalCatalogo = somar(...linhas.map((l) => multiplicar(l.precoCatalogo, qtd(l))));
  const desconto = Math.min(valorParaCentavos(descontoTexto) / 100, subtotal);
  return { subtotal, subtotalCatalogo, desconto, total: subtrair(subtotal, desconto) };
}

/** O que vai para a API: preço só quando é diferente do catálogo. */
export function itensParaEnvio(itens: Itens): { servicos: ItemServicoInput[]; pecas: ItemPecaInput[] } {
  return {
    servicos: itens.servicos.map((s) => ({
      servicoId: s.servicoId,
      quantidade: Math.max(1, Math.round(qtd(s))),
      ...(preco(s) !== s.precoCatalogo ? { precoUnit: preco(s) } : {}),
    })),
    pecas: itens.pecas.map((p) => ({
      pecaId: p.pecaId,
      quantidade: qtd(p),
      ...(preco(p) !== p.precoCatalogo ? { precoUnit: preco(p) } : {}),
    })),
  };
}

/** Itens de um orçamento salvo, prontos para editar. */
export function itensDoDTO(servicos: ItemServicoDTO[], pecas: ItemPecaDTO[]): Itens {
  return {
    servicos: servicos.map((s) => ({
      servicoId: s.servicoId,
      nome: s.nome,
      quantidade: String(s.quantidade),
      precoUnit: s.precoUnit.toFixed(2),
      precoCatalogo: s.precoCatalogo,
    })),
    pecas: pecas.map((p) => ({
      pecaId: p.pecaId,
      nome: p.nome,
      unidade: p.unidade,
      quantidade: numeroParaTexto(p.quantidade),
      precoUnit: p.precoUnit.toFixed(2),
      precoCatalogo: p.precoCatalogo,
      estoque: p.estoqueAtual,
    })),
  };
}

export function itensInvalidos(itens: Itens): string | null {
  if (itens.servicos.length + itens.pecas.length === 0) return 'Adicione ao menos 1 serviço ou peça.';
  if ([...itens.servicos, ...itens.pecas].some((l) => qtd(l) <= 0)) return 'Há item com quantidade zerada.';
  return null;
}

export function EditorItens({
  valor,
  onChange,
  podeAlterarPreco,
  podeCadastrarServico,
  comServicos = true,
  comPecas = true,
}: {
  valor: Itens;
  onChange: (itens: Itens) => void;
  podeAlterarPreco: boolean;
  podeCadastrarServico?: boolean;
  comServicos?: boolean;
  comPecas?: boolean;
}) {
  const [cadastrarServico, setCadastrarServico] = useState<string | null>(null);

  function addServico(s: ServicoDTO) {
    if (valor.servicos.some((x) => x.servicoId === s.id)) return;
    onChange({
      ...valor,
      servicos: [
        ...valor.servicos,
        { servicoId: s.id, nome: s.nome, quantidade: '1', precoUnit: s.precoMaoDeObra.toFixed(2), precoCatalogo: s.precoMaoDeObra },
      ],
    });
  }
  function addPeca(p: PecaDTO) {
    if (valor.pecas.some((x) => x.pecaId === p.id)) return;
    onChange({
      ...valor,
      pecas: [
        ...valor.pecas,
        {
          pecaId: p.id,
          nome: p.nome,
          unidade: p.unidade,
          quantidade: '1',
          precoUnit: p.precoVenda.toFixed(2),
          precoCatalogo: p.precoVenda,
          estoque: p.estoqueAtual,
        },
      ],
    });
  }
  const mudarServico = (i: number, parte: Partial<LinhaServico>) =>
    onChange({ ...valor, servicos: valor.servicos.map((l, k) => (k === i ? { ...l, ...parte } : l)) });
  const mudarPeca = (i: number, parte: Partial<LinhaPeca>) =>
    onChange({ ...valor, pecas: valor.pecas.map((l, k) => (k === i ? { ...l, ...parte } : l)) });

  return (
    <div className="space-y-4">
      {comServicos && (
        <Secao titulo="Serviços (mão de obra)">
          <div className="border border-linha rounded-xl">
            {valor.servicos.map((l, i) => (
              <Linha
                key={l.servicoId}
                nome={l.nome}
                quantidade={l.quantidade}
                inteiro
                onQuantidade={(v) => mudarServico(i, { quantidade: v })}
                precoUnit={l.precoUnit}
                precoCatalogo={l.precoCatalogo}
                podeAlterarPreco={podeAlterarPreco}
                onPreco={(v) => mudarServico(i, { precoUnit: v })}
                onRemover={() => onChange({ ...valor, servicos: valor.servicos.filter((_, k) => k !== i) })}
              />
            ))}
            <div className="p-2">
              <BuscaSelect<ServicoDTO>
                valor={null}
                limparAoEscolher
                chave="servicos"
                buscar={buscarServicos}
                id={(s) => s.id}
                rotulo={(s) => s.nome}
                detalhe={(s) => `${brl(s.precoMaoDeObra)}${s.categoria ? ` · ${s.categoria}` : ''}`}
                placeholder="+ Adicionar serviço (digite o nome)"
                onChange={(s) => s && addServico(s)}
                rodape={
                  podeCadastrarServico
                    ? (termo, fechar) => (
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            fechar();
                            setCadastrarServico(termo);
                          }}
                          className="w-full text-left px-3 py-2 text-sm font-bold text-laranja hover:bg-white inline-flex items-center gap-1.5"
                        >
                          <Plus size={14} /> Cadastrar serviço novo{termo ? ` "${termo}"` : ''}
                        </button>
                      )
                    : undefined
                }
              />
            </div>
          </div>
        </Secao>
      )}

      {comPecas && (
        <Secao titulo="Peças e produtos">
          <div className="border border-linha rounded-xl">
            {valor.pecas.map((l, i) => {
              const falta = (textoParaNumero(l.quantidade) ?? 0) > l.estoque;
              return (
                <Linha
                  key={l.pecaId}
                  nome={l.nome}
                  unidade={l.unidade}
                  quantidade={l.quantidade}
                  onQuantidade={(v) => mudarPeca(i, { quantidade: v })}
                  precoUnit={l.precoUnit}
                  precoCatalogo={l.precoCatalogo}
                  podeAlterarPreco={podeAlterarPreco}
                  onPreco={(v) => mudarPeca(i, { precoUnit: v })}
                  onRemover={() => onChange({ ...valor, pecas: valor.pecas.filter((_, k) => k !== i) })}
                  aviso={falta ? `só ${formatarQtd(Math.max(0, l.estoque), l.unidade)} em estoque` : undefined}
                />
              );
            })}
            <div className="p-2">
              <BuscaSelect<PecaDTO>
                valor={null}
                limparAoEscolher
                chave="pecas"
                buscar={buscarPecas}
                id={(p) => p.id}
                rotulo={(p) => p.nome}
                detalhe={(p) =>
                  `${brl(p.precoVenda)} · ${formatarQtd(p.estoqueAtual, p.unidade)} em estoque${p.codigoBarras ? ` · ${p.codigoBarras}` : ''}`
                }
                placeholder="+ Adicionar peça (nome, código ou bipe o leitor)"
                onChange={(p) => p && addPeca(p)}
              />
            </div>
          </div>
        </Secao>
      )}

      {cadastrarServico !== null && (
        <FormServico
          servico={null}
          nomeInicial={cadastrarServico}
          onFechar={() => setCadastrarServico(null)}
          onSalvo={(s) => {
            setCadastrarServico(null);
            addServico(s);
          }}
        />
      )}
    </div>
  );
}

function Linha({
  nome,
  unidade,
  quantidade,
  inteiro,
  onQuantidade,
  precoUnit,
  precoCatalogo,
  podeAlterarPreco,
  onPreco,
  onRemover,
  aviso,
}: {
  nome: string;
  unidade?: string;
  quantidade: string;
  inteiro?: boolean;
  onQuantidade: (v: string) => void;
  precoUnit: string;
  precoCatalogo: number;
  podeAlterarPreco: boolean;
  onPreco: (v: string) => void;
  onRemover: () => void;
  aviso?: string;
}) {
  const subtotal = multiplicar(Number(precoUnit || 0), textoParaNumero(quantidade) ?? 0);
  const negociado = Number(precoUnit || 0) !== precoCatalogo;
  return (
    <div className="flex items-center gap-2 sm:gap-3 px-3 py-2 border-b border-linha flex-wrap sm:flex-nowrap">
      <div className="flex-1 min-w-[10rem]">
        <div className="font-bold text-sm truncate">{nome}</div>
        <div className="text-xs text-grafite/50">
          {negociado ? (
            <span>
              tabela <s>{brl(precoCatalogo)}</s>
            </span>
          ) : (
            <span>{brl(precoCatalogo)} cada</span>
          )}
          {aviso && (
            <span className="text-amarelo font-bold inline-flex items-center gap-0.5 ml-1">
              <AlertTriangle size={11} /> {aviso}
            </span>
          )}
        </div>
      </div>
      <div className="w-20 shrink-0">
        <InputQuantidade value={quantidade} onChange={onQuantidade} inteiro={inteiro} ariaLabel={`Quantidade de ${nome}`} className="!py-1.5" />
        {unidade && <div className="text-[10px] text-center text-grafite/40 mt-0.5">{unidade}</div>}
      </div>
      {podeAlterarPreco && (
        <div className="w-32 shrink-0" title="Preço combinado (unitário)">
          <InputDinheiro value={precoUnit} onChange={onPreco} />
        </div>
      )}
      <div className="w-24 text-right font-bold tabular-nums text-sm shrink-0">{brl(subtotal)}</div>
      <button type="button" onClick={onRemover} className="text-grafite/30 hover:text-vermelho p-1 shrink-0" title="Tirar" aria-label={`Tirar ${nome}`}>
        <X size={16} />
      </button>
    </div>
  );
}
