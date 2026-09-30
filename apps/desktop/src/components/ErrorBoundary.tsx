import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';

/**
 * Última rede de proteção: um erro inesperado numa tela não pode virar
 * tela branca no balcão. Mostra o que houve e oferece recarregar.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { erro: Error | null }> {
  state = { erro: null as Error | null };

  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('Erro na tela:', erro, info.componentStack);
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="min-h-screen grid place-items-center p-6 bg-fundo">
        <div className="bg-white rounded-2xl border border-linha shadow-sm p-8 max-w-md text-center">
          <div className="w-14 h-14 rounded-2xl bg-vermelho-bg text-vermelho grid place-items-center mx-auto mb-3">
            <AlertOctagon size={28} />
          </div>
          <h1 className="text-xl font-extrabold text-petroleo">Algo deu errado nesta tela</h1>
          <p className="text-sm text-grafite/60 mt-2">
            Nenhum dado foi perdido — o que já estava salvo continua no servidor. Recarregue para continuar.
          </p>
          <pre className="text-[11px] text-left text-grafite/40 bg-fundo rounded-lg p-3 mt-4 overflow-auto max-h-32">{this.state.erro.message}</pre>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 mt-5 bg-petroleo hover:bg-petroleo/90 text-white font-bold px-4 py-2.5 rounded-xl"
          >
            <RefreshCw size={15} /> Recarregar
          </button>
        </div>
      </div>
    );
  }
}
