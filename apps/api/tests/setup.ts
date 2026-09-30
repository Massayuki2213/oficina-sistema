import { URL_TESTE_APP } from './banco-teste';

// Aponta tudo para o banco de TESTE antes de qualquer import do Prisma.
// Sem isto, um teste apagaria os dados de demonstração do banco de trabalho.
// A API usa o usuário da aplicação (só dados); o `db` dos testes, o dono.
process.env.DATABASE_URL = URL_TESTE_APP;
process.env.SESSAO_SEGREDO ??= 'segredo-de-teste-nao-usar-em-producao';
process.env.NODE_ENV = 'test';
process.env.TZ = 'America/Sao_Paulo';
process.env.BACKUP_ENABLED = 'false';
// A tela compilada não participa dos testes da API.
process.env.WEB_DIR = '/nao-existe';
