import { useLocation } from 'react-router-dom';
import { Construction } from 'lucide-react';

export default function EmBreve() {
  const { pathname } = useLocation();
  const nome = pathname.replace('/', '').replace('-', ' ') || 'Esta tela';

  return (
    <div className="grid place-items-center h-full text-center">
      <div>
        <div className="w-16 h-16 rounded-2xl bg-amarelo-bg text-amarelo grid place-items-center mx-auto mb-4">
          <Construction size={30} strokeWidth={2} />
        </div>
        <h2 className="text-xl font-extrabold text-petroleo mb-1 capitalize">{nome}</h2>
        <p className="text-grafite/50 max-w-sm">
          A API deste módulo já está pronta no back-end. A tela está na fila para ser construída — o padrão de Clientes será replicado aqui.
        </p>
      </div>
    </div>
  );
}
