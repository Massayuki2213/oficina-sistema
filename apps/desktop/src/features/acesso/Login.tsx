import { useState } from 'react';
import { Wrench, Eye, EyeOff } from 'lucide-react';
import { mensagemDeErro } from '../../api/http';
import { useSessao } from './sessao';

export default function Login() {
  const { entrar, situacao } = useSessao();
  // Só em desenvolvimento o formulário já vem com o usuário de demonstração.
  const [email, setEmail] = useState(import.meta.env.DEV ? 'dono@hermes.local' : '');
  const [senha, setSenha] = useState(import.meta.env.DEV ? 'hermes123' : '');
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [entrando, setEntrando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setEntrando(true);
    try {
      await entrar({ email, senha });
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div className="fixed inset-0 grid place-items-center p-6 bg-[radial-gradient(120%_120%_at_50%_0%,#0F3D57_0%,#0B2E42_75%)] overflow-y-auto">
      <form onSubmit={enviar} className="bg-white rounded-3xl p-8 sm:p-9 w-full max-w-[380px] shadow-2xl">
        <div className="flex items-center gap-3 mb-1">
          {situacao?.oficina.logo ? (
            <img src={situacao.oficina.logo} alt="" className="h-11 w-auto max-w-[120px] object-contain" />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-laranja text-white grid place-items-center shadow-lg shadow-laranja/40">
              <Wrench size={24} strokeWidth={2.2} />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-2xl font-extrabold text-petroleo tracking-wide leading-none">HERMES</div>
            <div className="text-xs text-grafite/50 font-semibold truncate">{situacao?.oficina.nome ?? 'Gestão de Oficina'}</div>
          </div>
        </div>

        <h2 className="text-base font-bold mt-6">Entrar</h2>
        <p className="text-[13px] text-grafite/50 mb-4">Acesse com seu usuário da oficina.</p>

        <label className="block">
          <span className="block text-xs font-bold text-grafite/50 uppercase tracking-wide mt-3.5 mb-1.5">E-mail</span>
          <input
            type="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3.5 py-3 border-[1.6px] border-linha rounded-xl outline-none focus:border-laranja transition"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-bold text-grafite/50 uppercase tracking-wide mt-3.5 mb-1.5">Senha</span>
          <div className="relative">
            <input
              type={verSenha ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full px-3.5 py-3 pr-11 border-[1.6px] border-linha rounded-xl outline-none focus:border-laranja transition"
            />
            <button
              type="button"
              onClick={() => setVerSenha((v) => !v)}
              aria-label={verSenha ? 'Esconder senha' : 'Mostrar senha'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-grafite/40 hover:text-grafite"
            >
              {verSenha ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>

        {erro && (
          <div role="alert" className="text-vermelho text-[13px] font-semibold mt-3">
            {erro}
          </div>
        )}

        <button
          type="submit"
          disabled={entrando}
          className="w-full mt-6 bg-laranja hover:bg-laranja-deep disabled:opacity-60 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-laranja/30 transition"
        >
          {entrando ? 'Entrando...' : 'Entrar no sistema'}
        </button>

        <p className="text-[11px] text-grafite/40 text-center mt-4">
          Esqueceu a senha? Peça ao Dono para redefinir em Configurações.
          {import.meta.env.DEV && <span className="block mt-1">Demonstração: dono@, atendente@ ou mecanico@hermes.local — senha hermes123</span>}
        </p>
      </form>
    </div>
  );
}
