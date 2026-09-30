import { Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useSessao } from './features/acesso/sessao';
import Login from './features/acesso/Login';
import PrimeiroAcesso from './features/acesso/PrimeiroAcesso';
import Layout from './components/Layout';
import NaoEncontrada from './components/NaoEncontrada';
import { Restrito } from './components/ui';
import { ROTAS, podeAcessar } from './rotas';

export default function App() {
  const { usuario, situacao, carregando, semServidor } = useSessao();

  if (carregando) return <Abertura />;
  if (semServidor) return <SemServidor />;
  if (situacao?.precisaConfigurar) return <PrimeiroAcesso />;
  if (!usuario) return <Login />;

  return (
    <Layout>
      <Suspense fallback={<div className="text-center text-grafite/40 py-20 text-sm">Carregando...</div>}>
        <Routes>
          {ROTAS.map((r) => (
            <Route key={r.caminho} path={r.caminho} element={podeAcessar(r, usuario) ? <r.tela /> : <Restrito />} />
          ))}
          <Route path="*" element={<NaoEncontrada />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

function Abertura() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-[radial-gradient(120%_120%_at_50%_0%,#0F3D57_0%,#0B2E42_75%)]">
      <div className="text-2xl font-extrabold text-white tracking-wide animate-pulse">HERMES</div>
    </div>
  );
}

function SemServidor() {
  const qc = useQueryClient();
  return (
    <div className="fixed inset-0 grid place-items-center p-6 bg-[radial-gradient(120%_120%_at_50%_0%,#0F3D57_0%,#0B2E42_75%)]">
      <div className="bg-white rounded-3xl p-8 w-full max-w-sm text-center shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-vermelho-bg text-vermelho grid place-items-center mx-auto mb-3">
          <WifiOff size={26} />
        </div>
        <h1 className="text-lg font-extrabold text-petroleo">Sem conexão com o servidor</h1>
        <p className="text-sm text-grafite/60 mt-2">
          Confira se o computador servidor da oficina está ligado e se este aparelho está na mesma rede (ou com internet, se o
          servidor for na nuvem).
        </p>
        <button
          onClick={() => void qc.invalidateQueries({ queryKey: ['sessao'] })}
          className="inline-flex items-center gap-2 mt-5 bg-laranja hover:bg-laranja-deep text-white font-bold px-4 py-2.5 rounded-xl"
        >
          <RefreshCw size={15} /> Tentar de novo
        </button>
      </div>
    </div>
  );
}
