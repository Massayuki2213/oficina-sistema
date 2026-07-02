import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';

export default function Login() {
  const { entrar } = useAuth();
  const [email, setEmail] = useState('dono@hermes.local');
  const [senha, setSenha] = useState('hermes123');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      await entrar(email, senha);
    } catch (err) {
      if (err instanceof ApiError) setErro(err.message);
      else setErro('Não foi possível conectar à API. Ela está rodando em localhost:3333?');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="fixed inset-0 grid place-items-center p-6 bg-[radial-gradient(120%_120%_at_50%_0%,#0F3D57_0%,#0B2E42_75%)]">
      <form onSubmit={submit} className="bg-white rounded-3xl p-9 w-[380px] shadow-2xl">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-11 h-11 rounded-xl bg-laranja text-white grid place-items-center shadow-lg shadow-laranja/40">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-petroleo tracking-wide leading-none">HERMES</div>
            <div className="text-xs text-grafite/50 font-semibold">Gestão de Oficina</div>
          </div>
        </div>

        <h2 className="text-base font-bold mt-6">Entrar</h2>
        <p className="text-[13px] text-grafite/50 mb-4">Acesse com seu usuário da oficina.</p>

        <label className="block text-xs font-bold text-grafite/50 uppercase tracking-wide mt-3.5 mb-1.5">E-mail</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3.5 py-3 border-[1.6px] border-linha rounded-xl outline-none focus:border-laranja transition"
        />

        <label className="block text-xs font-bold text-grafite/50 uppercase tracking-wide mt-3.5 mb-1.5">Senha</label>
        <input
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="w-full px-3.5 py-3 border-[1.6px] border-linha rounded-xl outline-none focus:border-laranja transition"
        />

        {erro && <div className="text-vermelho text-[13px] font-semibold mt-3">{erro}</div>}

        <button
          type="submit"
          disabled={carregando}
          className="w-full mt-6 bg-laranja hover:bg-laranja-deep disabled:opacity-60 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-laranja/30 transition"
        >
          {carregando ? 'Entrando...' : 'Entrar no sistema'}
        </button>

        <p className="text-[11px] text-grafite/40 text-center mt-4">
          Demonstração · dono@hermes.local · atendente@hermes.local · mecanico@hermes.local (senha: hermes123)
        </p>
      </form>
    </div>
  );
}
