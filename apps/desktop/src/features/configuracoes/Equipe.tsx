import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogOut, Plus, UserCheck, UserX } from 'lucide-react';
import { DESCRICAO_PERFIL, LABEL_PERFIL, PERFIS, type Perfil, type UsuarioDTO } from '@hermes/shared';
import { ApiError, http, mensagemDeErro } from '../../api/http';
import { useAvisos } from '../../lib/avisos';
import { dataHoraBR } from '../../lib/format';
import { useSessao } from '../acesso/sessao';
import { AcaoEditar, Badge, BtnGhost, BtnIcone, BtnPrimary, Campo, ErroFormulario, EstadoTabela, Modal, Painel, Selecao, inputCls, linhaCls, tdCls, thCls } from '../../components/ui';

const COR_PERFIL: Record<Perfil, string> = {
  DONO: 'bg-laranja/10 text-laranja',
  ATENDENTE: 'bg-azul-bg text-azul',
  MECANICO: 'bg-fundo text-grafite/70',
};

export function Equipe() {
  const { usuario } = useSessao();
  const qc = useQueryClient();
  const avisos = useAvisos();
  const consulta = useQuery({ queryKey: ['usuarios'], queryFn: () => http.get<UsuarioDTO[]>('/usuarios') });
  const [editando, setEditando] = useState<UsuarioDTO | 'novo' | null>(null);
  const [senhaDe, setSenhaDe] = useState<UsuarioDTO | null>(null);
  const lista = consulta.data ?? [];

  async function derrubarAparelhos(u: UsuarioDTO) {
    const ok = await avisos.confirmar({
      titulo: `Desconectar ${u.nome} de todos os aparelhos?`,
      mensagem: 'Serve para celular perdido ou computador que ficou logado. A senha continua a mesma: a pessoa entra de novo quando quiser.',
      botao: 'Desconectar',
      perigo: true,
    });
    if (!ok) return;
    try {
      const r = await http.post<{ encerradas: number }>(`/usuarios/${u.id}/encerrar-sessoes`);
      await qc.invalidateQueries({ queryKey: ['usuarios'] });
      avisos.sucesso(`${u.nome} foi desconectado de ${r.encerradas} aparelho(s).`);
    } catch (e) {
      avisos.erro(mensagemDeErro(e));
    }
  }

  async function alternarAtivo(u: UsuarioDTO) {
    if (u.ativo) {
      const ok = await avisos.confirmar({
        titulo: `Desativar ${u.nome}?`,
        mensagem: 'A pessoa não consegue mais entrar no sistema. O histórico dela (OS, lançamentos) continua guardado.',
        botao: 'Desativar',
        perigo: true,
      });
      if (!ok) return;
    }
    try {
      await http.patch(`/usuarios/${u.id}/ativo`, { ativo: !u.ativo });
      await Promise.all([['usuarios'], ['equipe']].map((queryKey) => qc.invalidateQueries({ queryKey })));
      avisos.sucesso(u.ativo ? `${u.nome} desativado.` : `${u.nome} reativado.`);
    } catch (e) {
      avisos.erro(mensagemDeErro(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-sm text-grafite/60 flex-1">Cada pessoa entra com o próprio e-mail e senha — assim o histórico mostra quem fez o quê.</p>
        <BtnPrimary icone={Plus} onClick={() => setEditando('novo')}>
          Nova pessoa
        </BtnPrimary>
      </div>
      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Nome</th>
              <th className={thCls}>Perfil</th>
              <th className={`${thCls} text-right`}>Comissão</th>
              <th className={thCls}>Último acesso</th>
              <th className={`${thCls} text-right`}>Ações</th>
            </tr>
          </thead>
          <tbody>
            <EstadoTabela carregando={consulta.isPending} erro={consulta.error} vazio={lista.length === 0} colSpan={5} onTentar={() => void consulta.refetch()} />
            {lista.map((u) => (
              <tr key={u.id} className={`${linhaCls} ${u.ativo ? '' : 'opacity-50'}`}>
                <td className={tdCls}>
                  <div className="font-bold">
                    {u.nome} {u.id === usuario?.id && <span className="text-xs font-semibold text-grafite/45">(você)</span>}
                  </div>
                  <div className="text-xs text-grafite/50">{u.email}</div>
                </td>
                <td className={tdCls}>
                  <Badge cor={COR_PERFIL[u.perfil]}>{LABEL_PERFIL[u.perfil]}</Badge>
                  {!u.ativo && <Badge cor="bg-vermelho-bg text-vermelho">Inativo</Badge>}
                </td>
                <td className={`${tdCls} text-right tabular-nums text-grafite/60`}>{u.comissaoPct != null ? `${u.comissaoPct.toLocaleString('pt-BR')}%` : '—'}</td>
                <td className={`${tdCls} text-grafite/60 whitespace-nowrap`}>
                  {u.ultimoAcesso ? dataHoraBR(u.ultimoAcesso) : 'nunca entrou'}
                  {u.sessoesAtivas > 0 && (
                    <div className="text-xs text-verde font-semibold">
                      conectado em {u.sessoesAtivas} aparelho{u.sessoesAtivas > 1 ? 's' : ''}
                    </div>
                  )}
                </td>
                <td className={`${tdCls} text-right whitespace-nowrap`}>
                  <AcaoEditar onClick={() => setEditando(u)} />
                  <BtnIcone icone={KeyRound} titulo="Definir nova senha" onClick={() => setSenhaDe(u)} />
                  {u.id !== usuario?.id && u.sessoesAtivas > 0 && (
                    <BtnIcone icone={LogOut} titulo="Desconectar de todos os aparelhos" onClick={() => void derrubarAparelhos(u)} />
                  )}
                  {u.id !== usuario?.id && (
                    <BtnIcone icone={u.ativo ? UserX : UserCheck} titulo={u.ativo ? 'Desativar' : 'Reativar'} perigo={u.ativo} onClick={() => void alternarAtivo(u)} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Painel>
      {editando && <FormUsuario usuario={editando === 'novo' ? null : editando} onFechar={() => setEditando(null)} />}
      {senhaDe && <RedefinirSenha usuario={senhaDe} onFechar={() => setSenhaDe(null)} />}
    </div>
  );
}

function FormUsuario({ usuario, onFechar }: { usuario: UsuarioDTO | null; onFechar: () => void }) {
  const qc = useQueryClient();
  const avisos = useAvisos();
  const [nome, setNome] = useState(usuario?.nome ?? '');
  const [email, setEmail] = useState(usuario?.email ?? '');
  const [perfil, setPerfil] = useState<Perfil>(usuario?.perfil ?? 'MECANICO');
  const [comissao, setComissao] = useState(usuario?.comissaoPct != null ? String(usuario.comissaoPct) : '');
  const [senha, setSenha] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);

  async function salvar() {
    const corpo = { nome, email, perfil, comissaoPct: comissao ? Number(comissao.replace(',', '.')) : null };
    setEnviando(true);
    setErros({});
    try {
      if (usuario) await http.put(`/usuarios/${usuario.id}`, { ...corpo, versao: usuario.versao });
      else await http.post('/usuarios', { ...corpo, senha });
      await Promise.all([['usuarios'], ['equipe'], ['sessao']].map((queryKey) => qc.invalidateQueries({ queryKey })));
      avisos.sucesso(usuario ? 'Dados atualizados.' : `${nome} já pode entrar com ${email}.`);
      onFechar();
    } catch (e) {
      if (e instanceof ApiError && e.erros) setErros(Object.fromEntries(Object.entries(e.erros).map(([k, v]) => [k, v[0]])));
      else setErros({ geral: mensagemDeErro(e) });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      title={usuario ? `Editar ${usuario.nome}` : 'Nova pessoa na equipe'}
      onClose={onFechar}
      onEnviar={() => void salvar()}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary type="submit" disabled={enviando}>
            {enviando ? 'Salvando...' : 'Salvar'}
          </BtnPrimary>
        </>
      }
    >
      <Campo label="Nome" erro={erros.nome}>
        <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} maxLength={80} />
      </Campo>
      <Campo label="E-mail (é o login)" erro={erros.email}>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
      </Campo>
      <Campo label="Perfil" erro={erros.perfil} ajuda={DESCRICAO_PERFIL[perfil]}>
        <Selecao value={perfil} onChange={(e) => setPerfil(e.target.value as Perfil)}>
          {PERFIS.map((p) => (
            <option key={p} value={p}>
              {LABEL_PERFIL[p]}
            </option>
          ))}
        </Selecao>
      </Campo>
      {perfil === 'MECANICO' && (
        <Campo label="Comissão sobre a mão de obra (%)" erro={erros.comissaoPct} ajuda="Aparece no relatório de produtividade. Deixe vazio se não houver.">
          <input inputMode="decimal" value={comissao} onChange={(e) => setComissao(e.target.value.replace(/[^\d,]/g, ''))} className={`${inputCls} tabular-nums`} />
        </Campo>
      )}
      {!usuario && (
        <Campo label="Senha inicial" erro={erros.senha} ajuda="Mínimo de 8 caracteres. A pessoa pode trocar depois, em Configurações.">
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} className={inputCls} autoComplete="new-password" />
        </Campo>
      )}
      <ErroFormulario>{erros.geral}</ErroFormulario>
    </Modal>
  );
}

function RedefinirSenha({ usuario, onFechar }: { usuario: UsuarioDTO; onFechar: () => void }) {
  const qc = useQueryClient();
  const avisos = useAvisos();
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function salvar() {
    setEnviando(true);
    try {
      await http.patch(`/usuarios/${usuario.id}/senha`, { senha });
      await qc.invalidateQueries({ queryKey: ['usuarios'] });
      avisos.sucesso(`Senha de ${usuario.nome} redefinida. Os aparelhos conectados foram desconectados.`);
      onFechar();
    } catch (e) {
      setErro(e instanceof ApiError && e.erros ? Object.values(e.erros)[0][0] : mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      title={`Nova senha para ${usuario.nome}`}
      onClose={onFechar}
      onEnviar={() => void salvar()}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary type="submit" disabled={enviando}>
            Definir senha
          </BtnPrimary>
        </>
      }
    >
      <Campo label="Nova senha" erro={erro} ajuda="Mínimo de 8 caracteres.">
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} className={inputCls} autoComplete="new-password" />
      </Campo>
    </Modal>
  );
}
