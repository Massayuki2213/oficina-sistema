import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import type { ClienteFichaDTO, ClienteResumoDTO } from '@hermes/shared';
import { http } from '../../api/http';
import { useAcao } from '../../api/acoes';
import { useListaPaginada, useParametroDeTela } from '../../api/lista';
import { useAvisos } from '../../lib/avisos';
import { useQueryClient } from '@tanstack/react-query';
import { formatarDocumento, formatarTelefone, iniciais } from '../../lib/format';
import { useSessao } from '../acesso/sessao';
import {
  AcaoEditar,
  AcaoExcluir,
  Badge,
  BtnPrimary,
  CampoBusca,
  EstadoTabela,
  PageHeader,
  Paginacao,
  Painel,
  linhaCls,
  tdCls,
  thCls,
} from '../../components/ui';
import FormCliente from './FormCliente';
import FichaCliente from './FichaCliente';

export default function ClientesPage() {
  const { pode } = useSessao();
  const avisos = useAvisos();
  const qc = useQueryClient();
  const lista = useListaPaginada<ClienteResumoDTO>('clientes', '/clientes');
  const [editando, setEditando] = useState<ClienteResumoDTO | ClienteFichaDTO | 'novo' | null>(null);
  const [ficha, setFicha] = useState<string | null>(null);
  const [abrir, limparAbrir] = useParametroDeTela('abrir');
  const [novo, limparNovo] = useParametroDeTela('novo');
  const itens = lista.dados?.itens ?? [];

  // Links de outras telas: /clientes?abrir=<id> e /clientes?novo=1
  useEffect(() => {
    if (abrir) {
      setFicha(abrir);
      limparAbrir();
    }
  }, [abrir, limparAbrir]);
  useEffect(() => {
    if (novo) {
      setEditando('novo');
      limparNovo();
    }
  }, [novo, limparNovo]);

  const excluir = useAcao((c: ClienteResumoDTO) => http.delete(`/clientes/${c.id}`), {
    invalidar: [['clientes']],
    sucesso: 'Cliente excluído da lista. O histórico dele continua guardado.',
  });

  async function confirmarExclusao(c: ClienteResumoDTO) {
    const ok = await avisos.confirmar({
      titulo: 'Excluir cliente',
      mensagem: `"${c.nome}" sai da lista. O histórico de OS é preservado.`,
      botao: 'Excluir',
      perigo: true,
    });
    if (ok) excluir.mutate(c);
  }

  return (
    <div>
      <PageHeader title="Clientes" subtitle={`${lista.dados?.total ?? 0} cliente(s)`}>
        <CampoBusca valor={lista.busca} onBuscar={lista.setBusca} placeholder="Nome, CPF, telefone ou placa..." autoFocus />
        <BtnPrimary icone={Plus} onClick={() => setEditando('novo')}>
          Novo cliente
        </BtnPrimary>
      </PageHeader>

      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Cliente</th>
              <th className={thCls}>CPF / CNPJ</th>
              <th className={thCls}>Telefone</th>
              <th className={thCls}>Veículos</th>
              <th className={`${thCls} text-right`}>Ações</th>
            </tr>
          </thead>
          <tbody>
            <EstadoTabela
              carregando={lista.consulta.isPending}
              erro={lista.consulta.error}
              vazio={itens.length === 0}
              colSpan={5}
              onTentar={() => void lista.consulta.refetch()}
              textoVazio={lista.busca ? 'Ninguém encontrado com essa busca.' : 'Nenhum cliente cadastrado ainda.'}
            />
            {itens.map((c) => (
              <tr key={c.id} onClick={() => setFicha(c.id)} className={`${linhaCls} cursor-pointer`}>
                <td className={tdCls}>
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-full bg-petroleo text-white grid place-items-center text-xs font-bold shrink-0">{iniciais(c.nome)}</span>
                    <span className="font-bold">{c.nome}</span>
                    {c.tipo === 'PJ' && <Badge>PJ</Badge>}
                  </div>
                </td>
                <td className={`${tdCls} text-grafite/60 whitespace-nowrap`}>{formatarDocumento(c.cpfCnpj) || '—'}</td>
                <td className={`${tdCls} whitespace-nowrap`}>{formatarTelefone(c.telefone ?? c.whatsapp) || '—'}</td>
                <td className={`${tdCls} font-semibold`}>{c.qtdVeiculos}</td>
                <td className={`${tdCls} text-right whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
                  <AcaoEditar onClick={() => setEditando(c)} />
                  {pode('apagarRegistros') && <AcaoExcluir onClick={() => void confirmarExclusao(c)} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Paginacao pagina={lista.pagina} porPagina={lista.porPagina} total={lista.dados?.total ?? 0} onPagina={lista.setPagina} />
      </Painel>

      {editando && (
        <FormCliente
          cliente={editando === 'novo' ? null : editando}
          onFechar={() => setEditando(null)}
          onSalvo={(c) => {
            setEditando(null);
            void qc.invalidateQueries({ queryKey: ['clientes', c.id] });
          }}
        />
      )}
      {ficha && (
        <FichaCliente
          clienteId={ficha}
          onFechar={() => setFicha(null)}
          onEditar={() => {
            const dados = qc.getQueryData<ClienteFichaDTO>(['clientes', ficha]);
            setFicha(null);
            if (dados) setEditando(dados);
          }}
        />
      )}
    </div>
  );
}
