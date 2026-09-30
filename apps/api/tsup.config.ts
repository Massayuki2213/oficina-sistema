import { defineConfig } from 'tsup';

// Build de produção da API:
//  - dist/server.js            o servidor;
//  - dist/redefinir-senha.js   recuperação de acesso pela linha de comando;
//  - dist/usuario-do-banco.js  prepara o usuário do banco da aplicação na partida do container;
//  - dist/abrir-backup.js      abre uma cópia cifrada (.sql.enc) para restaurar.
// O contrato compartilhado (@hermes/shared) é TypeScript puro e entra DENTRO
// do pacote — o Node não carrega .ts de node_modules. O resto das
// dependências (fastify, prisma...) continua sendo lido de node_modules.
export default defineConfig({
  entry: {
    server: 'src/server.ts',
    'redefinir-senha': 'src/cli/redefinir-senha.ts',
    'usuario-do-banco': 'src/cli/usuario-do-banco.ts',
    'abrir-backup': 'src/cli/abrir-backup.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: ['@hermes/shared'],
});
