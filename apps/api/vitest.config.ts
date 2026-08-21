import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Os testes batem num Postgres de verdade, então rodam em série: em paralelo
    // eles limpariam as tabelas uns dos outros.
    fileParallelism: false,
    sequence: { concurrent: false },
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
