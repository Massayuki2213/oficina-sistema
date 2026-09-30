import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Lê do .env da raiz SÓ as portas. (O `loadEnv` do Vite, apontado para lá,
 * encontraria o NODE_ENV=development da API e faria o build de produção
 * sair com o React de desenvolvimento — mais pesado e mais lento.)
 */
function portasDoEnvDaRaiz(): Record<string, string | undefined> {
  let arquivo: Record<string, string> = {};
  try {
    arquivo = parseEnv(readFileSync(new URL('../../.env', import.meta.url), 'utf8')) as Record<string, string>;
  } catch {
    // sem .env: valem as variáveis de ambiente e os padrões
  }
  const valor = (k: string) => process.env[k] ?? arquivo[k];
  return { API_PORT: valor('API_PORT'), WEB_PORT: valor('WEB_PORT'), VITE_API_PROXY: valor('VITE_API_PROXY') };
}

// Em desenvolvimento, a tela roda no Vite e as chamadas a /api vão para a
// API por proxy — mesma origem, então o cookie de sessão funciona igual à
// produção (onde a própria API serve a tela).
export default defineConfig(() => {
  const env = portasDoEnvDaRaiz();
  const api = env.VITE_API_PROXY ?? `http://localhost:${env.API_PORT ?? 3333}`;
  return {
    plugins: [react()],
    server: {
      port: Number(env.WEB_PORT ?? 5173),
      // Porta ocupada (outro projeto na máquina)? O Vite sobe na próxima livre.
      strictPort: false,
      proxy: { '/api': { target: api, changeOrigin: false } },
      // O app de desktop (Electron) e o instalador gerado moram aqui ao lado:
      // vigiá-los faria o Vite tropeçar em arquivos grandes e travados.
      watch: { ignored: ['**/electron/**', '**/release/**'] },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      chunkSizeWarningLimit: 600,
    },
  };
});
