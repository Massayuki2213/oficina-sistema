// Aponta tudo para o banco de TESTE antes de qualquer import do Prisma.
// Sem isto, um teste apagaria os dados de demonstração do banco de trabalho.
const url = process.env.TEST_DATABASE_URL ?? 'postgresql://hermes:hermes_dev@localhost:5434/hermes_test?schema=public';
process.env.DATABASE_URL = url;
process.env.JWT_SECRET ??= 'segredo-de-teste-nao-usar-em-producao';
process.env.NODE_ENV = 'test';

// O cache não participa dos testes: o que se quer provar é o que ficou no banco.
process.env.REDIS_URL ??= 'redis://localhost:6379';
