import { useState } from 'react';
import { X, AlertTriangle, Check, CheckSquare, PackageCheck, PackageSearch, Plus, Square, Truck } from 'lucide-react';
import { brl, formatarQtd, type ItemPecaOSDTO, type OrdemServicoDTO, type PecaDTO, type ServicoDTO, type UsuarioSessao } from '@hermes/shared';
import { http } from '../../api/http';
import { buscarPecas, buscarServicos } from '../../api/catalogo';
import { dataBR } from '../../lib/format';
import { BuscaSelect, DinheiroNoLugar, QuantidadeNoLugar, Secao, Vazio } from '../../components/ui';
import { PecaRapida } from '../estoque/PecaRapida';
import type { AcaoNaOS } from './api';

// ============================================================
// Itens da OS já aberta — cada mudança vai direto para o servidor
// (que baixa ou devolve a peça no estoque na hora e refaz o total).
// ============================================================

export function ItensDaOS({ os, usuario, executar, ocupado }: { os: OrdemServicoDTO; usuario: UsuarioSessao; executar: AcaoNaOS; ocupado: boolean }) {
  const p = usuario.permissoes;
  const aberta = !['ENTREGUE', 'CANCELADA'].includes(os.status) && !os.formaPagamento;
  const minha = os.mecanico?.id === usuario.id;
  const balcao = p.atender && aberta;
  // O mecânico lança e retira peça na OS dele; serviço e valores são do balcão.
  const mexeNasPecas = aberta && (p.atender || minha);
  const mexeNoPreco = aberta && p.darDesconto;
  // Quem confere o preço pela nota da autopeça é o Dono (o mesmo que lança a compra).
  const confereNota = aberta && p.alterarPrecoCusto;
  const aponta = os.status !== 'CANCELADA' && (p.atender || minha);
  const [cadastrarPeca, setCadastrarPeca] = useState<string | null>(null);

  const base = `/ordens/${os.id}`;

  return (
    <div className="space-y-4">
      <Secao titulo="Serviços (mão de obra)">
        <div className="border border-linha rounded-xl">
          {os.servicos.length === 0 && !balcao && (
            <div className="p-3">
              <Vazio>Nenhum serviço lançado</Vazio>
            </div>
          )}
          {os.servicos.map((s) => (
            <div key={s.id} className="flex items-center gap-2 sm:gap-3 px-3 py-2 border-b border-linha last:border-0 flex-wrap sm:flex-nowrap">
              <button
                type="button"
                disabled={!aponta || ocupado}
                onClick={() => void executar(() => http.patch<OrdemServicoDTO>(`${base}/servicos/${s.id}`, { concluido: !s.concluido }))}
                title={s.concluido ? 'Feito — clique para desmarcar' : 'Marcar como feito'}
                aria-label={s.concluido ? `${s.nome}: feito` : `${s.nome}: marcar como feito`}
                className={`shrink-0 ${s.concluido ? 'text-verde' : 'text-grafite/30 hover:text-grafite/60'} disabled:cursor-default`}
              >
                {s.concluido ? <CheckSquare size={20} /> : <Square size={20} />}
              </button>
              <div className="flex-1 min-w-[10rem]">
                <div className={`font-bold text-sm ${s.concluido ? 'text-grafite/50 line-through decoration-grafite/30' : ''}`}>{s.nome}</div>
                <div className="text-xs text-grafite/50">
                  {s.precoUnit !== s.precoCatalogo && s.precoCatalogo > 0 && !os.garantia ? (
                    <>
                      tabela <s>{brl(s.precoCatalogo)}</s>
                    </>
                  ) : (
                    `${brl(s.precoUnit)} cada`
                  )}
                </div>
              </div>
              <QuantidadeNoLugar
                valor={s.quantidade}
                inteiro
                editavel={balcao && !ocupado}
                onSalvar={(q) => executar((x) => http.patch<OrdemServicoDTO>(`${base}/servicos/${s.id}`, { quantidade: q, ...x }))}
              />
              {mexeNoPreco && (
                <DinheiroNoLugar
                  valor={s.precoUnit}
                  editavel={!ocupado}
                  titulo="Alterar o preço combinado"
                  onSalvar={(v) => executar((x) => http.patch<OrdemServicoDTO>(`${base}/servicos/${s.id}`, { precoUnit: v, ...x }))}
                />
              )}
              <div className="w-24 text-right font-bold tabular-nums text-sm shrink-0">{brl(s.subtotal)}</div>
              {balcao ? (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => void executar(() => http.delete<OrdemServicoDTO>(`${base}/servicos/${s.id}`))}
                  className="text-grafite/30 hover:text-vermelho p-1 shrink-0"
                  title="Tirar serviço"
                  aria-label={`Tirar ${s.nome}`}
                >
                  <X size={16} />
                </button>
              ) : (
                <span className="w-6 shrink-0" />
              )}
            </div>
          ))}
          {balcao && (
            <div className="p-2 border-t border-linha first:border-0">
              <BuscaSelect<ServicoDTO>
                valor={null}
                limparAoEscolher
                chave="servicos"
                buscar={buscarServicos}
                id={(x) => x.id}
                rotulo={(x) => x.nome}
                detalhe={(x) => brl(x.precoMaoDeObra)}
                placeholder="+ Lançar serviço"
                disabled={ocupado}
                onChange={(x) =>
                  x &&
                  void executar((e) => http.post<OrdemServicoDTO>(`${base}/servicos`, { servicoId: x.id, quantidade: 1, ...e }), {
                    sucesso: `${x.nome} lançado.`,
                  })
                }
              />
            </div>
          )}
        </div>
      </Secao>

      <Secao titulo="Peças e produtos">
        <div className="border border-linha rounded-xl">
          {os.pecas.length === 0 && !mexeNasPecas && (
            <div className="p-3">
              <Vazio>Nenhuma peça lançada</Vazio>
            </div>
          )}
          {os.pecas.map((pc) => (
            <div key={pc.id} className="flex items-center gap-2 sm:gap-3 px-3 py-2 border-b border-linha last:border-0 flex-wrap sm:flex-nowrap">
              <div className="flex-1 min-w-[10rem]">
                <div className="font-bold text-sm">{pc.nome}</div>
                <div className="text-xs text-grafite/50 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <span>
                    {pc.precoUnit !== pc.precoCatalogo && pc.precoCatalogo > 0 && !pc.precoADefinir ? (
                      <>
                        tabela <s>{brl(pc.precoCatalogo)}</s>
                      </>
                    ) : (
                      `${brl(pc.precoUnit)} / ${pc.unidade}`
                    )}
                  </span>
                  <SituacaoEncomenda pc={pc} />
                  {!pc.precoConferido && (
                    <span className="text-amarelo font-bold inline-flex items-center gap-0.5">
                      <AlertTriangle size={11} /> preço estimado
                      {confereNota && (
                        <button
                          type="button"
                          disabled={ocupado}
                          onClick={() =>
                            void executar(() => http.patch<OrdemServicoDTO>(`${base}/pecas/${pc.id}`, { conferirPreco: true }), {
                              sucesso: `Preço de ${pc.nome} conferido.`,
                            })
                          }
                          title="O preço estimado bate com a nota: marcar como conferido"
                          className="ml-1 inline-flex items-center gap-0.5 text-verde hover:underline"
                        >
                          <Check size={11} /> conferido
                        </button>
                      )}
                    </span>
                  )}
                </div>
              </div>
              <QuantidadeNoLugar
                valor={pc.quantidade}
                unidade={pc.unidade}
                editavel={mexeNasPecas && !ocupado}
                onSalvar={(q) => executar((x) => http.patch<OrdemServicoDTO>(`${base}/pecas/${pc.id}`, { quantidade: q, ...x }))}
              />
              {mexeNoPreco && (
                <DinheiroNoLugar
                  valor={pc.precoUnit}
                  editavel={!ocupado}
                  titulo="Alterar o preço combinado"
                  onSalvar={(v) => executar((x) => http.patch<OrdemServicoDTO>(`${base}/pecas/${pc.id}`, { precoUnit: v, ...x }))}
                />
              )}
              <div className="w-24 text-right font-bold tabular-nums text-sm shrink-0">{brl(pc.subtotal)}</div>
              {mexeNasPecas ? (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() =>
                    void executar(() => http.delete<OrdemServicoDTO>(`${base}/pecas/${pc.id}`), { sucesso: `${pc.nome} devolvida ao estoque.` })
                  }
                  className="text-grafite/30 hover:text-vermelho p-1 shrink-0"
                  title="Tirar peça (volta para o estoque)"
                  aria-label={`Tirar ${pc.nome}`}
                >
                  <X size={16} />
                </button>
              ) : (
                <span className="w-6 shrink-0" />
              )}
            </div>
          ))}
          {mexeNasPecas && (
            <div className="p-2 border-t border-linha first:border-0">
              <BuscaSelect<PecaDTO>
                valor={null}
                limparAoEscolher
                chave="pecas"
                buscar={buscarPecas}
                id={(x) => x.id}
                rotulo={(x) => x.nome}
                detalhe={(x) =>
                  `${brl(x.precoVenda)} · ${formatarQtd(x.estoqueAtual, x.unidade)} em estoque${x.localizacao ? ` · prateleira ${x.localizacao}` : ''}`
                }
                placeholder="+ Lançar peça (nome, código ou leitor)"
                disabled={ocupado}
                onChange={(x) =>
                  x &&
                  void executar((e) => http.post<OrdemServicoDTO>(`${base}/pecas`, { pecaId: x.id, quantidade: 1, ...e }), {
                    sucesso: `${x.nome} lançada — baixou 1 ${x.unidade} do estoque.`,
                  })
                }
                rodape={
                  balcao
                    ? (termo, fechar) => (
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            fechar();
                            setCadastrarPeca(termo);
                          }}
                          className="w-full text-left px-3 py-2 text-sm font-bold text-laranja hover:bg-white inline-flex items-center gap-1.5"
                        >
                          <Plus size={14} /> Cadastrar peça nova{termo ? ` "${termo}"` : ''}
                        </button>
                      )
                    : undefined
                }
              />
            </div>
          )}
        </div>
      </Secao>

      {cadastrarPeca !== null && (
        <PecaRapida
          nomeInicial={cadastrarPeca}
          onFechar={() => setCadastrarPeca(null)}
          onSalvo={(x, estimado) => {
            setCadastrarPeca(null);
            void executar((e) => http.post<OrdemServicoDTO>(`${base}/pecas`, { pecaId: x.id, quantidade: 1, precoUnit: estimado, ...e }), {
              sucesso: `${x.nome} lançada com preço estimado.`,
            });
          }}
        />
      )}
    </div>
  );
}

/** Em que pé está a encomenda da peça (RN-03): a pedir, pedida a uma autopeça, ou chegou. */
function SituacaoEncomenda({ pc }: { pc: ItemPecaOSDTO }) {
  if (pc.chegou) {
    const { compra, fornecedor, numeroNota } = pc.chegou;
    return (
      <span className="text-verde font-bold inline-flex items-center gap-0.5" title={`Chegou em ${dataBR(pc.chegou.data)}`}>
        <PackageCheck size={11} /> chegou: compra #{compra.numero} — {fornecedor}
        {numeroNota ? `, NF ${numeroNota}` : ''}
      </span>
    );
  }
  if (!pc.aPedir) return null;
  if (pc.pedido) {
    return (
      <span className="text-azul font-bold inline-flex items-center gap-0.5">
        <Truck size={11} /> pedida a {pc.pedido.fornecedor.nome} em {dataBR(pc.pedido.em)}
      </span>
    );
  }
  return (
    <span className="text-amarelo font-bold inline-flex items-center gap-0.5">
      <PackageSearch size={11} /> a pedir: {formatarQtd(pc.encomenda, pc.unidade)}
    </span>
  );
}
