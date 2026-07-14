import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './lib/auth';
import { AvisosProvider } from './lib/avisos';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AvisosProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </AvisosProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
