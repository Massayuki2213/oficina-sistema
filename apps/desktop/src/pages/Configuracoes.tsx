import { useEffect, useState } from 'react';
import { KeyRound, HardDriveDownload, UserPlus, ShieldCheck, CircleSlash2, AlertTriangle, Store, ImagePlus, Trash2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth, type Perfil } from '../lib/auth';
import { useAvisos } from '../lib/avisos';
import { dataBR, LABEL_PERFIL } from '../lib/format';
import { carregarOficina, definirOficina, oficinaAtual, type Oficina } from '../lib/oficina';
import { PageHeader, Painel, Badge, Modal, Campo, BtnPrimary, BtnGhost, AcaoEditar, inputCls, thCls, tdCls, VazioOuCarregando } from '../components/ui';

interface UsuarioAdmin {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  criadoEm: string;
}
interface ArquivoBackup {
  arquivo: string;
  criadoEm: string;
  bytes: number;
}
interface StatusBackup {
  ativo: boolean;
  pasta: string;
  retencaoDias: number;
  ultimo: ArquivoBackup | null;
  atrasado: boolean;
  total: number;
}

const PERFIS: Perfil[] = ['DONO', 'ATENDENTE', 'MECANICO'];

export default function Configuracoes() {
  const { usuario } = useAuth();
  const ehDono = usuario?.perfil === 'DONO';

  return (
    <div>
      <PageHeader title="Configurações" subtitle={ehDono ? 'Oficina, usuários, senha e backup' : 'Sua conta'} />
      <div className="space-y-6 max-w-4xl">
        <MinhaSenha />
        {ehDono && <DadosDaOficina />}
        {ehDono && <Usuarios meuId={usuario!.id} />}
        {ehDono && <Backup />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Minha senha — todo perfil troca a própria (confirmando a atual).
// ------------------------------------------------------------------
function MinhaSenha() {
  const avisos = useAvisos();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [repetir, setRepetir] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function trocar() {
    setErro('');
    if (nova.length < 6) return setErro('A nova senha precisa ter ao menos 6 caracteres.');
    if (nova !== repetir) return setErro('A confirmação não confere com a nova senha.');

    setSalvando(true);
    try {
      await api('/usuarios/minha-senha', { method: 'PATCH', body: { senhaAtual: atual, novaSenha: nova } });
      avisos.sucesso('Senha alterada. Use a nova no próximo login.');
      setAtual('');
      setNova('');
      setRepetir('');
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível trocar a senha');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Secao titulo="Minha senha" descricao="Troque a senha da sua conta." icone={KeyRound}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Campo label="Senha atual">
          <input type="password" value={atual} onChange={(e) => setAtual(e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Nova senha">
          <input type="password" value={nova} onChange={(e) => setNova(e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Repita a nova senha">
          <input type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} className={inputCls} />
        </Campo>
      </div>
      {erro && <div className="text-vermelho text-sm font-semibold mt-3">{erro}</div>}
      <div className="mt-4">
        <BtnPrimary onClick={trocar} disabled={salvando || !atual || !nova}>
          {salvando ? 'Salvando...' : 'Trocar senha'}
        </BtnPrimary>
      </div>
    </Secao>
  );
}

// ------------------------------------------------------------------
// Usuários (Dono) — criar, editar, redefinir senha, ativar/inativar.
// ------------------------------------------------------------------
function Usuarios({ meuId }: { meuId: string }) {
  const avisos = useAvisos();
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState<UsuarioAdmin | null>(null);
  const [senhaDe, setSenhaDe] = useState<UsuarioAdmin | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      setUsuarios(await api<UsuarioAdmin[]>('/usuarios'));
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    carregar();
  }, []);

  async function alternarAtivo(u: UsuarioAdmin) {
    if (u.ativo) {
      const ok = await avisos.confirmar({
        titulo: `Inativar ${u.nome}`,
        mensagem: 'A pessoa deixa de conseguir entrar no sistema. O histórico dela (OS, caixa) é preservado.',
        botao: 'Inativar',
        perigo: true,
      });
      if (!ok) return;
    }

    setOcupado(u.id);
    try {
      await api(`/usuarios/${u.id}/ativo`, { method: 'PATCH', body: { ativo: !u.ativo } });
      avisos.sucesso(u.ativo ? `${u.nome} não entra mais no sistema.` : `${u.nome} voltou a ter acesso.`);
      await carregar();
    } catch (err) {
      avisos.erro(err instanceof ApiError ? err.message : 'Erro ao alterar o acesso');
    } finally {
      setOcupado(null);
    }
  }

  const fechar = () => {
    setNovo(false);
    setEditar(null);
  };

  return (
    <Secao
      titulo="Usuários"
      descricao="Quem entra no sistema e o que cada um pode fazer."
      icone={ShieldCheck}
      acao={
        <BtnPrimary onClick={() => setNovo(true)}>
          <span className="inline-flex items-center gap-1.5">
            <UserPlus size={16} /> Novo usuário
          </span>
        </BtnPrimary>
      }
    >
      <Painel>
        <table className="w-full">
          <thead>
            <tr className="border-b border-linha">
              <th className={thCls}>Nome</th>
              <th className={thCls}>E-mail</th>
              <th className={thCls}>Perfil</th>
              <th className={thCls}>Acesso</th>
              <th className={`${thCls} text-right`}>Ações</th>
            </tr>
          </thead>
          <tbody>
            <VazioOuCarregando carregando={carregando} vazio={usuarios.length === 0} colSpan={5} />
            {usuarios.map((u) => (
              <tr key={u.id} className={`border-b border-fundo last:border-0 ${u.ativo ? '' : 'opacity-55'}`}>
                <td className={`${tdCls} font-bold`}>
                  {u.nome}
                  {u.id === meuId && <span className="text-[11px] text-grafite/40 font-semibold"> (você)</span>}
                </td>
                <td className={`${tdCls} text-grafite/60`}>{u.email}</td>
                <td className={tdCls}>
                  <Badge cor={u.perfil === 'DONO' ? 'bg-laranja/10 text-laranja-deep' : undefined}>{LABEL_PERFIL[u.perfil]}</Badge>
                </td>
                <td className={tdCls}>
                  {u.ativo ? (
                    <Badge cor="bg-verde-bg text-verde">ativo</Badge>
                  ) : (
                    <Badge cor="bg-vermelho-bg text-vermelho">sem acesso</Badge>
                  )}
                </td>
                <td className={`${tdCls} text-right whitespace-nowrap`}>
                  <button
                    onClick={() => setSenhaDe(u)}
                    title="Redefinir senha"
                    className="text-grafite/50 hover:text-petroleo p-1.5 rounded-lg hover:bg-fundo transition"
                  >
                    <KeyRound size={16} />
                  </button>
                  <AcaoEditar onClick={() => setEditar(u)} />
                  <button
                    onClick={() => alternarAtivo(u)}
                    disabled={ocupado === u.id || u.id === meuId}
                    title={u.id === meuId ? 'Você não pode tirar o próprio acesso' : u.ativo ? 'Tirar o acesso' : 'Devolver o acesso'}
                    className="text-grafite/40 hover:text-vermelho p-1.5 rounded-lg hover:bg-fundo disabled:opacity-30 disabled:hover:text-grafite/40 transition"
                  >
                    <CircleSlash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Painel>

      {(novo || editar) && (
        <FormUsuario
          usuario={editar}
          onFechar={fechar}
          onSalvo={(nome) => {
            avisos.sucesso(editar ? `${nome} atualizado.` : `${nome} agora tem acesso ao sistema.`);
            fechar();
            carregar();
          }}
        />
      )}
      {senhaDe && (
        <RedefinirSenha
          usuario={senhaDe}
          onFechar={() => setSenhaDe(null)}
          onSalvo={() => {
            avisos.sucesso(`Senha de ${senhaDe.nome} redefinida.`);
            setSenhaDe(null);
          }}
        />
      )}
    </Secao>
  );
}

function FormUsuario({ usuario, onFechar, onSalvo }: { usuario: UsuarioAdmin | null; onFechar: () => void; onSalvo: (nome: string) => void }) {
  const editando = !!usuario;
  const [form, setForm] = useState({
    nome: usuario?.nome ?? '',
    email: usuario?.email ?? '',
    perfil: usuario?.perfil ?? ('ATENDENTE' as Perfil),
    senha: '',
  });
  const [erros, setErros] = useState<Record<string, string[]>>({});
  const [salvando, setSalvando] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function salvar() {
    setSalvando(true);
    setErros({});
    try {
      if (editando) {
        await api(`/usuarios/${usuario!.id}`, { method: 'PUT', body: { nome: form.nome, email: form.email, perfil: form.perfil } });
      } else {
        await api('/usuarios', { method: 'POST', body: form });
      }
      onSalvo(form.nome);
    } catch (err) {
      if (err instanceof ApiError) setErros(err.erros ?? { nome: [err.message] });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title={editando ? 'Editar usuário' : 'Novo usuário'}
      onClose={onFechar}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar usuário'}
          </BtnPrimary>
        </>
      }
    >
      <Campo label="Nome" erro={erros.nome?.[0]}>
        <input value={form.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ex: Marina" className={inputCls} />
      </Campo>
      <Campo label="E-mail (é o login)" erro={erros.email?.[0]}>
        <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="marina@oficina.local" className={inputCls} />
      </Campo>
      <Campo label="Perfil" erro={erros.perfil?.[0]}>
        <select value={form.perfil} onChange={(e) => set('perfil', e.target.value)} className={inputCls}>
          {PERFIS.map((p) => (
            <option key={p} value={p}>
              {LABEL_PERFIL[p]}
            </option>
          ))}
        </select>
      </Campo>
      {!editando && (
        <Campo label="Senha inicial" erro={erros.senha?.[0]}>
          <input type="password" value={form.senha} onChange={(e) => set('senha', e.target.value)} placeholder="ao menos 6 caracteres" className={inputCls} />
        </Campo>
      )}
      <p className="text-xs text-grafite/50 leading-snug">
        <b>Dono</b> vê o financeiro e administra o sistema · <b>Atendente</b> atende e vende, sem financeiro ·{' '}
        <b>Mecânico</b> executa as OS, sem desconto nem financeiro.
      </p>
    </Modal>
  );
}

function RedefinirSenha({ usuario, onFechar, onSalvo }: { usuario: UsuarioAdmin; onFechar: () => void; onSalvo: () => void }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro('');
    setSalvando(true);
    try {
      await api(`/usuarios/${usuario.id}/senha`, { method: 'PATCH', body: { senha } });
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Erro ao redefinir');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      title={`Redefinir a senha de ${usuario.nome}`}
      onClose={onFechar}
      footer={
        <>
          <BtnGhost onClick={onFechar}>Cancelar</BtnGhost>
          <BtnPrimary onClick={salvar} disabled={salvando || senha.length < 6}>
            {salvando ? 'Salvando...' : 'Redefinir senha'}
          </BtnPrimary>
        </>
      }
    >
      <Campo label="Nova senha" erro={erro}>
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="ao menos 6 caracteres" className={inputCls} autoFocus />
      </Campo>
      <p className="text-xs text-grafite/50">Combine a senha com a pessoa — ela pode trocá-la depois em Configurações.</p>
    </Modal>
  );
}

// ------------------------------------------------------------------
// Backup do banco (Dono).
// ------------------------------------------------------------------
function Backup() {
  const avisos = useAvisos();
  const [status, setStatus] = useState<StatusBackup | null>(null);
  const [gerando, setGerando] = useState(false);

  const carregar = () => api<StatusBackup>('/backup').then(setStatus).catch(() => {});
  useEffect(() => {
    carregar();
  }, []);

  async function gerarAgora() {
    setGerando(true);
    try {
      const feito = await api<ArquivoBackup>('/backup', { method: 'POST', body: {} });
      avisos.sucesso(`Backup gerado (${Math.max(1, Math.round(feito.bytes / 1024))} KB).`);
      await carregar();
    } catch (err) {
      avisos.erro(err instanceof ApiError ? err.message : 'Erro ao gerar o backup');
    } finally {
      setGerando(false);
    }
  }

  return (
    <Secao
      titulo="Backup do banco"
      descricao="Cópia de segurança automática, gerada a cada 24h (inclusive ao ligar o computador)."
      icone={HardDriveDownload}
      acao={
        <BtnPrimary onClick={gerarAgora} disabled={gerando}>
          {gerando ? 'Gerando...' : 'Fazer backup agora'}
        </BtnPrimary>
      }
    >
      {!status ? (
        <div className="text-sm text-grafite/40">Carregando...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Info rotulo="Último backup" valor={status.ultimo ? `${dataBR(status.ultimo.criadoEm)} às ${new Date(status.ultimo.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'nenhum ainda'} alerta={status.atrasado} />
            <Info rotulo="Cópias guardadas" valor={`${status.total} (últimos ${status.retencaoDias} dias)`} />
            <Info rotulo="Automático" valor={status.ativo ? 'ligado' : 'desligado'} alerta={!status.ativo} />
          </div>

          {status.atrasado && (
            <div className="mt-3 flex items-start gap-2.5 bg-amarelo-bg rounded-xl p-3 text-sm">
              <AlertTriangle size={18} className="text-amarelo shrink-0 mt-0.5" />
              <span className="text-grafite/70">
                A cópia mais recente tem mais de 24h. Se o computador ficou desligado, ela é feita sozinha ao ligar — ou clique em
                "Fazer backup agora".
              </span>
            </div>
          )}

          <p className="text-xs text-grafite/50 mt-3 leading-snug">
            Os arquivos ficam em <code className="font-mono bg-fundo px-1 py-0.5 rounded">{status.pasta}</code>. Copie-os para um
            pendrive ou nuvem de vez em quando: backup no mesmo computador não protege contra o HD queimar.
          </p>
        </>
      )}
    </Secao>
  );
}

// ------------------------------------------------------------------
// Dados da oficina — o que sai no cabeçalho do orçamento e da OS,
// mais os números que as regras usam (RN-08 desconto, RN-18 garantia).
// ------------------------------------------------------------------
const LIMITE_LOGO_KB = 300;

function DadosDaOficina() {
  const avisos = useAvisos();
  const [form, setForm] = useState<Oficina>(oficinaAtual());
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erros, setErros] = useState<Record<string, string[]>>({});

  useEffect(() => {
    void carregarOficina().then((o) => {
      setForm(o);
      setCarregando(false);
    });
  }, []);

  const set = (k: keyof Oficina, v: string | number | null) => setForm((f) => ({ ...f, [k]: v }));

  function escolherLogo(arquivo: File) {
    if (arquivo.size > LIMITE_LOGO_KB * 1024) {
      return avisos.erro(`Logo muito grande (máx. ${LIMITE_LOGO_KB} KB). Reduza a imagem e tente de novo.`);
    }
    const leitor = new FileReader();
    leitor.onload = () => set('logo', String(leitor.result));
    leitor.onerror = () => avisos.erro('Não consegui ler o arquivo do logo.');
    leitor.readAsDataURL(arquivo);
  }

  async function salvar() {
    setSalvando(true);
    setErros({});
    try {
      const salvo = await api<Oficina>('/oficina', { method: 'PUT', body: form });
      definirOficina(salvo);
      setForm(salvo);
      avisos.sucesso('Dados da oficina salvos. Já valem no próximo documento impresso.');
    } catch (err) {
      if (err instanceof ApiError) {
        setErros(err.erros ?? {});
        if (!err.erros) avisos.erro(err.message);
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Secao
      titulo="Dados da oficina"
      descricao="Aparecem no orçamento e na OS que você entrega ao cliente."
      icone={Store}
      acao={<BtnPrimary onClick={salvar} disabled={salvando || carregando}>{salvando ? 'Salvando...' : 'Salvar'}</BtnPrimary>}
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <Campo label="Nome da oficina" erro={erros.nome?.[0]}>
          <input className={inputCls} value={form.nome} onChange={(e) => set('nome', e.target.value)} />
        </Campo>
        <Campo label="Descrição curta">
          <input className={inputCls} placeholder="Serviços automotivos" value={form.subtitulo ?? ''} onChange={(e) => set('subtitulo', e.target.value)} />
        </Campo>
        <Campo label="CNPJ">
          <input className={inputCls} value={form.cnpj ?? ''} onChange={(e) => set('cnpj', e.target.value)} />
        </Campo>
        <Campo label="Telefone">
          <input className={inputCls} value={form.telefone ?? ''} onChange={(e) => set('telefone', e.target.value)} />
        </Campo>
        <Campo label="E-mail">
          <input className={inputCls} value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} />
        </Campo>
        <Campo label="Endereço">
          <input className={inputCls} value={form.endereco ?? ''} onChange={(e) => set('endereco', e.target.value)} />
        </Campo>
      </div>

      <div className="mt-4">
        <div className="text-[13px] font-bold text-grafite/60 mb-1.5">Logo no documento impresso</div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="w-28 h-16 rounded-xl border border-linha bg-fundo grid place-items-center overflow-hidden shrink-0">
            {form.logo ? (
              <img src={form.logo} alt="Logo" className="max-h-full max-w-full object-contain" />
            ) : (
              <ImagePlus size={22} className="text-grafite/30" />
            )}
          </div>
          <label className="cursor-pointer text-sm font-bold text-azul hover:underline">
            Escolher imagem
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) escolherLogo(f);
                e.target.value = '';
              }}
            />
          </label>
          {form.logo && (
            <button onClick={() => set('logo', null)} className="inline-flex items-center gap-1.5 text-sm font-bold text-vermelho hover:underline">
              <Trash2 size={14} /> Remover
            </button>
          )}
          <span className="text-xs text-grafite/40">PNG ou JPG, até {LIMITE_LOGO_KB} KB.</span>
        </div>
        {erros.logo?.[0] && <div className="text-xs text-vermelho mt-1.5 font-semibold">{erros.logo[0]}</div>}
      </div>

      <div className="border-t border-linha mt-5 pt-5">
        <div className="text-[13px] font-bold text-grafite/60 mb-3">Regras do negócio</div>
        <div className="grid sm:grid-cols-3 gap-4">
          <Campo label="Margem padrão (%)" erro={erros.margemPadrao?.[0]}>
            <input type="number" min={0} className={inputCls} value={form.margemPadrao} onChange={(e) => set('margemPadrao', Number(e.target.value))} />
          </Campo>
          <Campo label="Desconto sem senha (%)" erro={erros.descontoMaxSemSenha?.[0]}>
            <input type="number" min={0} max={100} className={inputCls} value={form.descontoMaxSemSenha} onChange={(e) => set('descontoMaxSemSenha', Number(e.target.value))} />
          </Campo>
          <Campo label="Garantia (dias)" erro={erros.garantiaDias?.[0]}>
            <input type="number" min={0} className={inputCls} value={form.garantiaDias} onChange={(e) => set('garantiaDias', Number(e.target.value))} />
          </Campo>
        </div>
        <p className="text-xs text-grafite/50 mt-2.5">
          Acima do limite de desconto, o orçamento passa a exigir a senha do Dono. A garantia define
          por quantos dias o serviço pode voltar sem cobrança.
        </p>
      </div>
    </Secao>
  );
}

function Info({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="bg-fundo rounded-xl px-3.5 py-2.5">
      <div className="text-[11px] font-bold text-grafite/40 uppercase tracking-wide">{rotulo}</div>
      <div className={`font-bold mt-0.5 ${alerta ? 'text-vermelho' : 'text-petroleo'}`}>{valor}</div>
    </div>
  );
}

function Secao({
  titulo,
  descricao,
  icone: Icone,
  acao,
  children,
}: {
  titulo: string;
  descricao: string;
  icone: typeof KeyRound;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-linha shadow-sm p-5 sm:p-6">
      <div className="flex items-start gap-3.5 mb-5 flex-wrap">
        <div className="w-11 h-11 rounded-xl bg-fundo text-petroleo grid place-items-center shrink-0">
          <Icone size={21} strokeWidth={2.2} />
        </div>
        <div className="min-w-[12rem]">
          <h2 className="text-lg font-extrabold text-petroleo leading-tight">{titulo}</h2>
          <p className="text-sm text-grafite/50 mt-0.5">{descricao}</p>
        </div>
        <div className="flex-1" />
        {acao}
      </div>
      {children}
    </section>
  );
}
