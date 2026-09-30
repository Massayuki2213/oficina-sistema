// ============================================================
// @hermes/shared/schemas — validação de entrada (Zod).
//
// A API valida o corpo de cada requisição com estes schemas, e a
// tela usa os tipos `z.input<...>` para montar o que envia. Mesmo
// schema dos dois lados = mesma regra, mesma mensagem de erro.
//
// Fica num subcaminho separado de propósito: quem só precisa dos
// enums e rótulos não carrega o Zod no pacote da tela.
// ============================================================

import { z } from 'zod';

// Mensagens padrão do Zod em português (as nossas, explícitas, têm prioridade).
z.config(z.locales.ptBR());

export * from './comum.js';
export * from './acesso.js';
export * from './cadastros.js';
export * from './operacao.js';
export * from './financeiro.js';
