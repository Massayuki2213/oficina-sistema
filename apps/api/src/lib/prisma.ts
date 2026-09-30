import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

// Cliente único do banco (PostgreSQL), reaproveitado em toda a aplicação.
export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  // O padrão do Prisma (5 s por transação) é apertado para o PC da oficina,
  // que muitas vezes é modesto e divide a máquina com outras coisas: uma
  // venda ou recebimento esperando a trava de linha de outro não pode cair
  // no meio. 15 s de folga; 5 s para conseguir uma conexão do pool.
  transactionOptions: { timeout: 15_000, maxWait: 5_000 },
});
