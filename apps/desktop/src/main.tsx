import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ApiError, EVENTO_DADOS_DESATUALIZADOS } from './api/http';
import { AvisosProvider } from './lib/avisos';
import { SessaoProvider } from './features/acesso/sessao';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Dados do servidor ficam num cache compartilhado: trocar de tela e voltar
// não recarrega tudo, e depois de uma ação só as listas afetadas se refazem.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      // Erro de regra (4xx) não melhora tentando de novo; rede/servidor, talvez.
      retry: (tentativas, erro) => (erro instanceof ApiError && erro.status >= 400 && erro.status < 500 ? false : tentativas < 2),
      refetchOnWindowFocus: true,
    },
  },
});

// Alguém salvou antes (409 CONFLITO_EDICAO): o cache está velho. Recarrega o
// que estiver na tela, para quem reabrir o formulário já ver a versão atual.
window.addEventListener(EVENTO_DADOS_DESATUALIZADOS, () => void queryClient.invalidateQueries());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AvisosProvider>
          <ErrorBoundary>
            <SessaoProvider>
              <App />
            </SessaoProvider>
          </ErrorBoundary>
        </AvisosProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
