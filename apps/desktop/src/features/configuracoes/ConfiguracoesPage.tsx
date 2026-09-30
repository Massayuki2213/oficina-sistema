import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, DatabaseBackup, Download, KeyRound, Lock, LockOpen, LogOut, MonitorSmartphone } from 'lucide-react';
import { DESCRICAO_PERFIL, LABEL_PERFIL, type SessaoDTO, type StatusBackupDTO } from '@hermes/shared';
import { ApiError, http, mensagemDeErro, urlDaApi } from '../../api/http';
import { useAvisos } from '../../lib/avisos';
import { dataHoraBR, relativo } from '../../lib/format';
import { useSessao } from '../acesso/sessao';
import { Badge, BtnGhost, BtnPrimary, Campo, ErroAoCarregar, ErroFormulario, PageHeader, inputCls } from '../../components/ui';
import { DadosOficina } from './DadosOficina';
import { Equipe } from './Equipe';

type Aba = 'conta' | 'oficina' | 'equipe' | 'backup';

export default function ConfiguracoesPage() {
  const { pode } = useSessao();
  const abas: { id: Aba; rotulo: string; visivel: boolean }[] = [
    { id: 'conta', rotulo: 'Minha conta', visivel: true },
    { id: 'oficina', rotulo: 'Oficina', visivel: pode('configurarOficina') },
    { id: 'equipe', rotulo: 'Equipe', visivel: pode('gerenciarUsuarios') },
    { id: 'backup', rotulo: 'Backup', visivel: pode('gerenciarBackup') },
  ];
  const [aba, setAba] = useState<Aba>('conta');

  return (
    <div>
      <PageHeader title="Configurações" />
      <div className="flex items-center gap-1 bg-white border border-linha rounded-xl p-1 mb-5 w-fit max-w-full overflow-x-auto" role="tablist">
        {abas
          .filter((a) => a.visivel)
          .map((a) => (
            <button
              key={a.id}
              role="tab"
              aria-selected={aba === a.id}
              onClick={() => setAba(a.id)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition whitespace-nowrap ${aba === a.id ? 'bg-petroleo text-white shadow-sm' : 'text-grafite/60 hover:bg-fundo'}`}
            >
              {a.rotulo}
            </button>
          ))}
      </div>
      <div className="max-w-5xl">
        {aba === 'conta' && <MinhaConta />}
        {aba === 'oficina' && <DadosOficina />}
        {aba === 'equipe' && <Equipe />}
        {aba === 'backup' && <Backup />}
      </div>
    </div>
  );
}

function MinhaConta() {
  const { usuario } = useSessao();
  const qc = useQueryClient();
  const avisos = useAvisos();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  if (!usuario) return null;

  async function trocar() {
    if (nova !== confirma) return setErros({ confirma: 'As duas senhas não são iguais.' });
    setEnviando(true);
    setErros({});
    try {
      await http.patch('/usuarios/minha-senha', { senhaAtual: atual, novaSenha: nova });
      setAtual('');
      setNova('');
      setConfirma('');
      await qc.invalidateQueries({ queryKey: ['sessoes'] });
      avisos.sucesso('Senha trocada. Se você estava logado em outro computador, lá vai pedir para entrar de novo.');
    } catch (e) {
      if (e instanceof ApiError && e.erros) setErros({ atual: e.erros.senhaAtual?.[0] ?? '', nova: e.erros.novaSenha?.[0] ?? '' });
      else setErros({ geral: mensagemDeErro(e) });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid md:grid-cols-2 gap-5 items-start">
      <section className="bg-white rounded-2xl border border-linha shadow-sm p-5">
        <div className="text-xs font-bold text-grafite/45 uppercase tracking-wide">Você</div>
        <div className="text-lg font-extrabold text-petroleo mt-1">{usuario.nome}</div>
        <div className="text-sm text-grafite/60">{usuario.email}</div>
        <div className="mt-3 text-sm">
          <strong>{LABEL_PERFIL[usuario.perfil]}</strong> — <span className="text-grafite/60">{DESCRICAO_PERFIL[usuario.perfil]}</span>
        </div>
      </section>
      <form
        className="bg-white rounded-2xl border border-linha shadow-sm p-5 space-y-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void trocar();
        }}
      >
        <h2 className="font-extrabold text-petroleo inline-flex items-center gap-2">
          <KeyRound size={17} /> Trocar minha senha
        </h2>
        <Campo label="Senha atual" erro={erros.atual || undefined}>
          <input type="password" value={atual} onChange={(e) => setAtual(e.target.value)} className={inputCls} autoComplete="current-password" />
        </Campo>
        <Campo label="Nova senha" erro={erros.nova || undefined} ajuda="Mínimo de 8 caracteres.">
          <input type="password" value={nova} onChange={(e) => setNova(e.target.value)} className={inputCls} autoComplete="new-password" />
        </Campo>
        <Campo label="Repita a nova senha" erro={erros.confirma}>
          <input type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} className={inputCls} autoComplete="new-password" />
        </Campo>
        <ErroFormulario>{erros.geral}</ErroFormulario>
        <div className="flex justify-end">
          <BtnPrimary type="submit" disabled={enviando || !atual || !nova}>
            {enviando ? 'Trocando...' : 'Trocar senha'}
          </BtnPrimary>
        </div>
      </form>
      <Aparelhos />
    </div>
  );
}

/** Onde a pessoa está logada agora — e o botão de sair de lá (ADR 0009). */
function Aparelhos() {
  const qc = useQueryClient();
  const avisos = useAvisos();
  const consulta = useQuery({ queryKey: ['sessoes'], queryFn: () => http.get<SessaoDTO[]>('/auth/sessoes') });
  const lista = consulta.data ?? [];
  const outras = lista.filter((s) => !s.atual).length;

  async function sairDe(s: SessaoDTO) {
    try {
      await http.delete(`/auth/sessoes/${s.id}`);
      await qc.invalidateQueries({ queryKey: ['sessoes'] });
      avisos.sucesso(`Pronto: ${s.aparelho ?? 'aquele aparelho'} vai pedir para entrar de novo.`);
    } catch (e) {
      avisos.erro(mensagemDeErro(e));
    }
  }

  async function sairDosOutros() {
    const ok = await avisos.confirmar({
      titulo: 'Sair dos outros aparelhos?',
      mensagem: `Você continua conectado aqui. ${outras === 1 ? 'O outro aparelho vai' : `Os outros ${outras} aparelhos vão`} pedir para entrar de novo.`,
      botao: 'Sair dos outros',
    });
    if (!ok) return;
    try {
      await http.post('/auth/sessoes/encerrar-outras');
      await qc.invalidateQueries({ queryKey: ['sessoes'] });
      avisos.sucesso('Pronto: só este aparelho continua conectado.');
    } catch (e) {
      avisos.erro(mensagemDeErro(e));
    }
  }

  return (
    <section className="md:col-span-2 bg-white rounded-2xl border border-linha shadow-sm">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-linha">
        <h2 className="font-extrabold text-petroleo inline-flex items-center gap-2 flex-1">
          <MonitorSmartphone size={17} /> Onde você está conectado
        </h2>
        <BtnGhost icone={LogOut} onClick={() => void sairDosOutros()} disabled={outras === 0}>
          Sair dos outros aparelhos
        </BtnGhost>
      </div>
      {consulta.error && <ErroAoCarregar erro={consulta.error} onTentar={() => void consulta.refetch()} />}
      {lista.map((s) => (
        <div key={s.id} className="flex items-center gap-3 px-5 py-3 border-b border-fundo last:border-0 text-sm">
          <div className="flex-1 min-w-0">
            <div className="font-bold">
              {s.aparelho ?? 'Aparelho sem identificação'}{' '}
              {s.atual && <Badge cor="bg-verde-bg text-verde">Este aparelho</Badge>}
            </div>
            <div className="text-xs text-grafite/55">
              {s.ip ? `IP ${s.ip} · ` : ''}entrou em {dataHoraBR(s.criadaEm)} · usado {relativo(s.ultimoUso)}
            </div>
          </div>
          {!s.atual && (
            <BtnGhost icone={LogOut} onClick={() => void sairDe(s)}>
              Sair
            </BtnGhost>
          )}
        </div>
      ))}
      <p className="px-5 py-3 text-xs text-grafite/50 border-t border-linha">
        Sem uso por um turno, a sessão se encerra sozinha. Trocar a senha desconecta todos os aparelhos.
      </p>
    </section>
  );
}

const tamanho = (bytes: number) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.ceil(bytes / 1024)} KB`;

function Backup() {
  const qc = useQueryClient();
  const avisos = useAvisos();
  const consulta = useQuery({ queryKey: ['backup'], queryFn: () => http.get<StatusBackupDTO>('/backup') });
  const [gerando, setGerando] = useState(false);
  const s = consulta.data;

  async function gerar() {
    setGerando(true);
    try {
      await http.post('/backup');
      await qc.invalidateQueries({ queryKey: ['backup'] });
      avisos.sucesso('Backup feito. Baixe e guarde uma cópia fora deste computador.');
    } catch (e) {
      avisos.erro(mensagemDeErro(e));
    } finally {
      setGerando(false);
    }
  }

  if (consulta.error) return <ErroAoCarregar erro={consulta.error} onTentar={() => void consulta.refetch()} />;
  if (!s) return <div className="text-center text-grafite/40 py-10 text-sm">Carregando...</div>;

  return (
    <div className="space-y-4">
      <section className={`rounded-2xl p-5 flex items-start gap-3 ${s.atrasado ? 'bg-amarelo-bg' : 'bg-verde-bg'}`}>
        {s.atrasado ? <AlertTriangle className="text-amarelo shrink-0" /> : <CheckCircle2 className="text-verde shrink-0" />}
        <div className="flex-1">
          <div className="font-extrabold text-petroleo">
            {s.ultimo ? `Último backup ${relativo(s.ultimo.criadoEm)} (${dataHoraBR(s.ultimo.criadoEm)})` : 'Nenhum backup feito ainda'}
          </div>
          <p className="text-sm text-grafite/65 mt-0.5">
            {s.ativo
              ? `O sistema faz uma cópia automática todo dia e guarda as dos últimos ${s.retencaoDias} dias em ${s.pasta}.`
              : 'O backup automático está desligado neste servidor (BACKUP_ENABLED).'}{' '}
            Uma cópia só no mesmo computador não protege de roubo, incêndio ou HD queimado: baixe de vez em quando para um pendrive ou para a nuvem.
          </p>
          <p className="text-sm mt-1.5 inline-flex items-center gap-1.5">
            {s.criptografado ? (
              <>
                <Lock size={14} className="text-verde" /> <strong>Cópias cifradas:</strong>{' '}
                <span className="text-grafite/65">sem a senha das cópias (BACKUP_SENHA), ninguém lê o conteúdo. Guarde a senha longe do pendrive.</span>
              </>
            ) : (
              <>
                <LockOpen size={14} className="text-amarelo" /> <strong>Cópias sem cifra:</strong>{' '}
                <span className="text-grafite/65">quem achar o pendrive lê tudo. Para cifrar, veja "Backup cifrado" no manual de implantação.</span>
              </>
            )}
          </p>
        </div>
        <BtnPrimary icone={DatabaseBackup} onClick={() => void gerar()} disabled={gerando}>
          {gerando ? 'Fazendo...' : 'Fazer backup agora'}
        </BtnPrimary>
      </section>

      <section className="bg-white rounded-2xl border border-linha shadow-sm">
        <h2 className="px-4 py-3 border-b border-linha font-extrabold text-petroleo text-sm">Cópias guardadas ({s.total})</h2>
        {s.arquivos.length === 0 && <div className="px-4 py-6 text-sm text-grafite/40 text-center">Nenhuma cópia ainda.</div>}
        {s.arquivos.map((a) => (
          <div key={a.arquivo} className="flex items-center gap-3 px-4 py-2.5 border-b border-fundo last:border-0 text-sm">
            <span className="font-mono text-xs flex-1 truncate">{a.arquivo}</span>
            <span className="text-grafite/50 whitespace-nowrap">{dataHoraBR(a.criadoEm)}</span>
            <span className="text-grafite/50 w-20 text-right tabular-nums">{tamanho(a.bytes)}</span>
            <a href={urlDaApi(`/backup/${encodeURIComponent(a.arquivo)}`)} download className="inline-flex items-center gap-1 font-bold text-laranja hover:underline">
              <Download size={14} /> Baixar
            </a>
          </div>
        ))}
      </section>
      <p className="text-xs text-grafite/50">Para restaurar uma cópia, siga o passo a passo do manual de implantação (docs/IMPLANTACAO.md).</p>
    </div>
  );
}
