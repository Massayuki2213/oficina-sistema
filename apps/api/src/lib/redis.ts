import Redis from 'ioredis';
import { env } from './env.js';

// Cache (Redis). Usos previstos:
//  - sessão/token blacklist do login (JWT + perfis)
//  - cache de listas pesadas (catálogo de serviços, dashboard)
//  - alertas de estoque baixo e "oportunidades de retorno"
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('error', (err) => console.error('⚠️  Redis erro:', err.message));

export async function connectRedis() {
  await redis.connect();
  console.log('⚡ Redis (cache) conectado');
}

export async function disconnectRedis() {
  await redis.quit();
}

// Helper: cache com TTL (segundos). Busca no cache; se não houver, roda a fn e guarda.
export async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit) as T;

  const value = await fn();
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  return value;
}
