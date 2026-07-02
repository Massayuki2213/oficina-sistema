import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

// Cliente único do banco (PostgreSQL). Reaproveitado em toda a aplicação.
export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export async function connectDatabase() {
  await prisma.$connect();
  console.log('🗄️  PostgreSQL conectado');
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}
