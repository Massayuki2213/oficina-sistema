import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setToken } from './api';

export type Perfil = 'DONO' | 'ATENDENTE' | 'MECANICO';
export interface Usuario {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
}

interface AuthCtx {
  usuario: Usuario | null;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => void;
  podeVerFinanceiro: boolean;
}

const Ctx = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(() => {
    const raw = localStorage.getItem('hermes_user');
    return raw ? (JSON.parse(raw) as Usuario) : null;
  });

  // A camada de API dispara este evento em respostas 401.
  useEffect(() => {
    const onLogout = () => setUsuario(null);
    window.addEventListener('hermes:logout', onLogout);
    return () => window.removeEventListener('hermes:logout', onLogout);
  }, []);

  async function entrar(email: string, senha: string) {
    const r = await api<{ token: string; usuario: Usuario }>('/auth/login', {
      method: 'POST',
      body: { email, senha },
    });
    setToken(r.token);
    localStorage.setItem('hermes_user', JSON.stringify(r.usuario));
    setUsuario(r.usuario);
  }

  function sair() {
    setToken(null);
    localStorage.removeItem('hermes_user');
    setUsuario(null);
  }

  return (
    <Ctx.Provider value={{ usuario, entrar, sair, podeVerFinanceiro: usuario?.perfil === 'DONO' }}>
      {children}
    </Ctx.Provider>
  );
}
