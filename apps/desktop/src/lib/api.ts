// Cliente HTTP da API Hermes. Guarda o token em memória + localStorage.
const BASE = (import.meta.env.VITE_API_URL as string) ?? 'http://localhost:3333';

let token: string | null = localStorage.getItem('hermes_token');

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem('hermes_token', t);
  else localStorage.removeItem('hermes_token');
}
export function getToken() {
  return token;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public erros?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(BASE + path, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (res.status === 401) {
    // Token inválido/expirado: derruba a sessão.
    setToken(null);
    localStorage.removeItem('hermes_user');
    window.dispatchEvent(new Event('hermes:logout'));
  }
  if (!res.ok) throw new ApiError(res.status, data?.message ?? 'Erro na requisição', data?.erros);
  return data as T;
}
