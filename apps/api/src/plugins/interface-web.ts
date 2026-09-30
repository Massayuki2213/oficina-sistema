import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { env } from '../lib/env.js';
import { COD } from '../lib/errors.js';

// ============================================================
// A API serve a tela (o build do Vite).
//
// Um endereço só para tudo: http://servidor:3333 abre o sistema no
// navegador de qualquer PC ou tablet da oficina, e o app desktop
// (Electron) é só uma janela apontada para ele. A tela sempre bate
// com a versão da API — atualizou o servidor, atualizou todo mundo.
// ============================================================

export async function registrarInterfaceWeb(app: FastifyInstance) {
  const raiz = env.webDir;

  if (raiz) {
    await app.register(fastifyStatic, {
      root: raiz,
      prefix: '/',
      // O fallback da SPA (abaixo) cuida das rotas da tela. Sem curinga, as
      // rotas dos arquivos são montadas na partida: build novo da tela pede
      // reiniciar o servidor (numa atualização, os dois trocam juntos).
      wildcard: false,
      index: false,
      setHeaders(reply, caminho) {
        // Arquivos com hash no nome nunca mudam: cache longo. O index.html
        // precisa ser revalidado sempre, senão uma versão nova não chega.
        if (/[\\/]assets[\\/]/.test(caminho)) reply.header('Cache-Control', 'public, max-age=31536000, immutable');
        else reply.header('Cache-Control', 'no-cache');
      },
    });
    app.log.info(`🖥️  Interface servida de ${raiz}`);
  }

  app.setNotFoundHandler((req, reply) => {
    const ehApi = req.url === '/api' || req.url.startsWith('/api/');
    // Rotas da tela (/ordens, /clientes...) recebem o index.html; o React
    // Router resolve do lado do navegador. Arquivo com extensão que não
    // existe é 404 de verdade (evita devolver HTML no lugar de um .js).
    const pedeTela = req.method === 'GET' && !ehApi && !/\.[a-z0-9]+$/i.test(req.url.split('?')[0]);

    if (raiz && pedeTela) {
      reply.header('Cache-Control', 'no-cache');
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ message: 'Rota não encontrada', codigo: COD.NAO_ENCONTRADO });
  });
}
