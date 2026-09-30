import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, HandCoins, Plus, Wallet } from 'lucide-react';
import { brl, type ContasAPagarDTO, type FornecedorDTO } from '@hermes/shared';
import { http } from '../../api/http';
import { useAcao } from '../../api/acoes';
import { useAvisos } from '../../lib/avisos';
import { formatarTelefone } from '../../lib/format';
import { linkWhatsApp } from '../../lib/whatsapp';
import { useSessao } from '../acesso/sessao';
import { AcaoEditar, AcaoExcluir, BtnIcone, BtnPrimary, BtnWhatsApp, CampoBusca, EstadoTabela, Kpi, PageHeader, Painel, linhaCls, tdCls, thCls } from '../../components/ui';
import { PagarConta } from '../../components/PagarConta';
import { FormFornecedor } from './FormFornecedor';

export default function DistribuidoresPage() {
  const { pode } = useSessao();
  const qc = useQueryClient();
  const avisos = useAvisos();
  const consulta = useQuery({ queryKey: ['fornecedores'], queryFn: () => http.get<FornecedorDTO[]>('/fornecedores') });
  const aPagar = useQuery({ queryKey: ['compras', 'a-pagar'], queryFn: () => http.get<ContasAPagarDTO>('/compras/a-pagar'), enabled: pode('verFinanceiro') });
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<FornecedorDTO | 'novo' | null>(null);
  const [acertando, setAcertando] = useState<FornecedorDTO | null>(null);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (consulta.data ?? []).filter((f) => !t || f.nome.toLowerCase().includes(t) || (f.contato ?? '').toLowerCase().includes(t));
  }, [consulta.data, busca]);

  const excluir = useAcao((f: FornecedorDTO) => http.delete(`/fornecedores/${f.id}`), { invalidar: [['fornecedores']], sucesso: 'Distribuidor excluído.' });
  const financeiro = pode('verFinanceiro');

  return (
    <div>
      <PageHeader title="Distribuidores" subtitle="De quem a oficina compra peça — e quanto deve a cada um">
        <CampoBusca valor={busca} onBuscar={setBusca} placeholder="Nome ou vendedor..." />
        {pode('alterarPrecoCusto') && (
          <BtnPrimary icone={Plus} onClick={() => setEditando('novo')}>
            Novo distribuidor
          </BtnPrimary>
        )}
      </PageHeader>

      {financeiro && aPagar.data && (
        <div className="grid sm:grid-cols-2 gap-3 mb-5">
          <Kpi label="Total a pagar" valor={brl(aPagar.data.totalAPagar)} icon={Wallet} cor="bg-amarelo-bg text-amarelo" sub={`${aPagar.data.fornecedores.length} distribuidor(es) com conta aberta`} />
          <Kpi
            label="Já vencido"
            valor={brl(aPagar.data.totalVencido)}
            icon={AlertTriangle}
            cor={aPagar.data.totalVencido > 0 ? 'bg-vermelho-bg text-vermelho' : 'bg-fundo text-grafite/40'}
            sub="boletos com vencimento no passado"
          />
        </div>
      )}

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Distribuidor</th>
              <th className={thCls}>Contato</th>
              <th className={`${thCls} text-right`}>Prazo</th>
              <th className={`${thCls} text-right`}>Peças</th>
              {financeiro && <th className={`${thCls} text-right`}>Deve</th>}
              <th className={`${thCls} text-right`}>Ações</th>
            </tr>
          </thead>
          <tbody>
            <EstadoTabela
              carregando={consulta.isPending}
              erro={consulta.error}
              vazio={lista.length === 0}
              colSpan={financeiro ? 6 : 5}
              textoVazio="Nenhum distribuidor cadastrado."
              onTentar={() => void consulta.refetch()}
            />
            {lista.map((f) => (
              <tr key={f.id} className={linhaCls}>
                <td className={tdCls}>
                  <div className="font-bold">{f.nome}</div>
                  {f.observacoes && <div className="text-xs text-grafite/45 truncate max-w-xs">{f.observacoes}</div>}
                </td>
                <td className={tdCls}>
                  <div>{f.contato ?? '—'}</div>
                  <div className="flex items-center gap-2 text-xs text-grafite/50">
                    {formatarTelefone(f.telefone)}
                    <BtnWhatsApp compacto href={linkWhatsApp(f.telefone, `Olá${f.contato ? `, ${f.contato.split(' ')[0]}` : ''}! Tudo bem? Preciso de um orçamento de peças.`)} />
                  </div>
                </td>
                <td className={`${tdCls} text-right text-grafite/60`}>{f.prazoEntrega != null ? `${f.prazoEntrega} dia(s)` : '—'}</td>
                <td className={`${tdCls} text-right tabular-nums`}>{f.qtdPecas}</td>
                {financeiro && (
                  <td className={`${tdCls} text-right`}>
                    <span className={`font-extrabold tabular-nums ${f.deve > 0 ? 'text-amarelo' : 'text-grafite/40'}`}>{brl(f.deve)}</span>
                    {f.comprasAbertas > 0 && <div className="text-[11px] text-grafite/45">{f.comprasAbertas} compra(s) em aberto</div>}
                  </td>
                )}
                <td className={`${tdCls} text-right whitespace-nowrap`}>
                  {financeiro && f.deve > 0 && <BtnIcone icone={HandCoins} titulo="Acertar tudo com este distribuidor" onClick={() => setAcertando(f)} />}
                  {pode('alterarPrecoCusto') && <AcaoEditar onClick={() => setEditando(f)} />}
                  {pode('apagarRegistros') && (
                    <AcaoExcluir
                      onClick={async () => {
                        const ok = await avisos.confirmar({ titulo: `Excluir ${f.nome}?`, mensagem: 'Só é possível se não houver compras, peças ou despesas ligadas a ele.', botao: 'Excluir', perigo: true });
                        if (ok) excluir.mutate(f);
                      }}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Painel>

      {editando && <FormFornecedor fornecedor={editando === 'novo' ? null : editando} onFechar={() => setEditando(null)} />}
      {acertando && (
        <PagarConta
          titulo={`Acertar com ${acertando.nome}`}
          valor={acertando.deve}
          formaPadrao="TRANSFERENCIA"
          onFechar={() => setAcertando(null)}
          onConfirmar={async (forma) => {
            await http.post(`/compras/acerto/${acertando.id}`, { formaPagamento: forma });
            await Promise.all([['fornecedores'], ['compras'], ['caixa'], ['alertas'], ['relatorios']].map((queryKey) => qc.invalidateQueries({ queryKey })));
            avisos.sucesso(`Contas com ${acertando.nome} quitadas.`);
          }}
        >
          Quita as {acertando.comprasAbertas} compra(s) em aberto de uma vez. O valor sai do caixa.
        </PagarConta>
      )}
    </div>
  );
}
