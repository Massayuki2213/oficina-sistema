import { Link, useLocation } from 'react-router-dom';
import { Compass, Home } from 'lucide-react';

/**
 * Página não encontrada.
 *
 * Já foi o aviso de "tela ainda não construída", quando faltavam telas. Hoje
 * todas existem, então quem cai aqui digitou um endereço que não existe —
 * dizer o contrário só confundiria.
 */
export default function NaoEncontrada() {
  const { pathname } = useLocation();

  return (
    <div className="grid place-items-center h-full text-center">
      <div>
        <div className="w-16 h-16 rounded-2xl bg-fundo text-grafite/40 grid place-items-center mx-auto mb-4">
          <Compass size={30} strokeWidth={2} />
        </div>
        <h2 className="text-xl font-extrabold text-petroleo mb-1">Página não encontrada</h2>
        <p className="text-grafite/50 max-w-sm">
          Não existe nada em <span className="font-mono text-grafite/70">{pathname}</span>. Use o menu ao lado
          ou volte para o painel do dia.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 mt-5 bg-petroleo hover:bg-petroleo/90 text-white font-bold px-4 py-2.5 rounded-xl"
        >
          <Home size={16} /> Ir para o início
        </Link>
      </div>
    </div>
  );
}
