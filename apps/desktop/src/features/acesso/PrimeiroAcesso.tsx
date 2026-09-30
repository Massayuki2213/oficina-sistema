import { useState } from 'react';
import { Wrench, Rocket } from 'lucide-react';
import { ApiError, mensagemDeErro } from '../../api/http';
import { useSessao } from './sessao';
import { Campo, inputCls } from '../../components/ui';

/**
 * Primeira vez que o sistema abre, com o banco vazio: quem instalou cria
 * o usuário do Dono e dá nome à oficina. Assim nenhuma instalação nasce
 * com senha padrão — o problema do "hermes123" que só se trocava no banco.
 */
export default function PrimeiroAcesso() {
  const { primeiroAcesso } = useSessao();
  const [form, setForm] = useState({ oficinaNome: '', nome: '', email: '', senha: '', repetir: '' });
  const [erros, setErros] = useState<Record<string, string[]>>({});
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setErros({});
    if (form.senha !== form.repetir) return setErros({ repetir: ['As senhas não conferem'] });
    setSalvando(true);
    try {
      await primeiroAcesso({ oficinaNome: form.oficinaNome, nome: form.nome, email: form.email, senha: form.senha });
    } catch (err) {
      if (err instanceof ApiError && err.erros) setErros(err.erros);
      setErro(mensagemDeErro(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 grid place-items-center p-6 bg-[radial-gradient(120%_120%_at_50%_0%,#0F3D57_0%,#0B2E42_75%)] overflow-y-auto">
      <form onSubmit={enviar} className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-3.5 my-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-laranja text-white grid place-items-center shadow-lg shadow-laranja/40">
            <Wrench size={24} strokeWidth={2.2} />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-petroleo tracking-wide leading-none">HERMES</div>
            <div className="text-xs text-grafite/50 font-semibold">Vamos configurar a sua oficina</div>
          </div>
        </div>

        <p className="text-sm text-grafite/60">
          Este é o primeiro acesso. Crie o usuário do <b>Dono</b> — ele administra o sistema, vê o financeiro e cadastra o resto da
          equipe depois.
        </p>

        <Campo label="Nome da oficina" erro={erros.oficinaNome?.[0]}>
          <input className={inputCls} value={form.oficinaNome} onChange={(e) => set('oficinaNome', e.target.value)} autoFocus placeholder="Ex.: Auto Mecânica Silva" />
        </Campo>
        <Campo label="Seu nome" erro={erros.nome?.[0]}>
          <input className={inputCls} value={form.nome} onChange={(e) => set('nome', e.target.value)} />
        </Campo>
        <Campo label="E-mail (é o seu login)" erro={erros.email?.[0]}>
          <input type="email" className={inputCls} value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="username" />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Senha" erro={erros.senha?.[0]} ajuda="Mínimo de 8 caracteres">
            <input type="password" className={inputCls} value={form.senha} onChange={(e) => set('senha', e.target.value)} autoComplete="new-password" />
          </Campo>
          <Campo label="Repita a senha" erro={erros.repetir?.[0]}>
            <input type="password" className={inputCls} value={form.repetir} onChange={(e) => set('repetir', e.target.value)} autoComplete="new-password" />
          </Campo>
        </div>

        {erro && !Object.keys(erros).length && <div className="text-vermelho text-sm font-semibold">{erro}</div>}

        <button
          type="submit"
          disabled={salvando}
          className="w-full inline-flex items-center justify-center gap-2 bg-laranja hover:bg-laranja-deep disabled:opacity-60 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-laranja/30"
        >
          <Rocket size={18} /> {salvando ? 'Configurando...' : 'Começar a usar'}
        </button>
      </form>
    </div>
  );
}
