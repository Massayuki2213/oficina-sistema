import { defineConfig } from 'vitest/config';

// Testes das funções puras da tela (máscaras, datas, totais, CSV).
// O que depende de servidor é coberto pelos testes da API.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
