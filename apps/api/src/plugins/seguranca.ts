import type { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { env } from '../lib/env.js';

// ============================================================
// Cabeçalhos de segurança e CORS.
// (O freio contra adivinhar senha fica em lib/tentativas.ts.)
// ============================================================

export async function registrarSeguranca(app: FastifyInstance) {
  await app.register(helmet, {
    // A política de conteúdo vale para a tela servida pela API. Em
    // desenvolvimento ela atrapalharia a documentação interativa (/api/docs).
    contentSecurityPolicy: env.producao
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            // Tailwind gera arquivo .css; o 'unsafe-inline' cobre estilos de bibliotecas.
            styleSrc: ["'self'", "'unsafe-inline'"],
            // data: é o logo da oficina (guardado em base64) e os ícones.
            imgSrc: ["'self'", 'data:', 'blob:'],
            fontSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: null,
          },
        }
      : false,
    // O servidor da oficina costuma ser http:// na rede local; HSTS só faz
    // sentido atrás de HTTPS, e aí o proxy (Caddy, nuvem) é quem o envia.
    strictTransportSecurity: false,
  });

  // Normalmente a tela é servida pela própria API (mesma origem) e CORS não
  // entra em jogo. Só libera origens explicitamente configuradas.
  if (env.corsOrigens.length > 0) {
    await app.register(cors, { origin: env.corsOrigens, credentials: true });
  }
}
