// ESLint do monorepo (API, tela, contrato compartilhado e o app de desktop).
// Formatação não é assunto daqui — só o que pega bug de verdade.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default defineConfig(
  globalIgnores(['**/dist/**', '**/node_modules/**', '**/release/**', '**/coverage/**', 'apps/api/prisma/migrations/**']),

  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // `void promessa` marca de propósito o "não precisa esperar".
      'no-void': 'off',
      eqeqeq: ['error', 'smart'],
    },
  },

  // Tela (React no navegador)
  {
    files: ['apps/desktop/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // API, contrato, scripts e configs (Node)
  {
    files: ['apps/api/**/*.ts', 'packages/**/*.ts', '**/*.config.{ts,mjs,js}', 'eslint.config.mjs'],
    languageOptions: { globals: globals.node },
  },

  // App de desktop (Electron, CommonJS)
  {
    files: ['apps/desktop/electron/**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
