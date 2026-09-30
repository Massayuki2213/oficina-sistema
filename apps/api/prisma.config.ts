import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Configuração do Prisma CLI (substitui a chave "prisma" do package.json,
// que sai no Prisma 7). As variáveis de ambiente chegam pelos scripts
// (dotenv -e ../../.env) — com este arquivo, o CLI não lê .env sozinho.
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});
