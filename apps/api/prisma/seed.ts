import { PrismaClient, PerfilUsuario } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Popula o banco com dados iniciais (usuários + catálogo) para desenvolvimento/demonstração.
// Idempotente: pode rodar de novo sem duplicar. Rode com: npm run db:seed
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Populando o banco...');

  // ---- Usuários / perfis (3 perfis do PLANEJAMENTO.md seção 2) ----
  const senhaHash = await bcrypt.hash('hermes123', 10);
  const usuarios: { nome: string; email: string; perfil: PerfilUsuario }[] = [
    { nome: 'João', email: 'dono@hermes.local', perfil: 'DONO' },
    { nome: 'Marina', email: 'atendente@hermes.local', perfil: 'ATENDENTE' },
    { nome: 'Pedro', email: 'mecanico@hermes.local', perfil: 'MECANICO' },
  ];
  for (const u of usuarios) {
    await prisma.usuario.upsert({
      where: { email: u.email },
      update: { nome: u.nome, perfil: u.perfil, senhaHash, ativo: true },
      create: { ...u, senhaHash },
    });
  }
  console.log(`👤 ${usuarios.length} usuários prontos (senha padrão: hermes123)`);

  // ---- Catálogo de serviços (só popula se vazio) ----
  if ((await prisma.servico.count()) === 0) {
    await prisma.servico.createMany({
      data: [
        { nome: 'Troca de óleo + filtro', categoria: 'Motor', precoMaoDeObra: 80 },
        { nome: 'Alinhamento e balanceamento', categoria: 'Suspensão', precoMaoDeObra: 120 },
        { nome: 'Troca de pastilha de freio', categoria: 'Freios', precoMaoDeObra: 150 },
        { nome: 'Revisão completa 20mil km', categoria: 'Revisão', precoMaoDeObra: 350 },
        { nome: 'Troca de correia dentada', categoria: 'Motor', precoMaoDeObra: 400 },
        { nome: 'Diagnóstico elétrico (scanner)', categoria: 'Elétrica', precoMaoDeObra: 90 },
      ],
    });
    console.log('🔧 serviços criados');
  }

  // ---- Peças / estoque (só popula se vazio) ----
  if ((await prisma.peca.count()) === 0) {
    await prisma.peca.createMany({
      data: [
        { nome: 'Óleo 5W30 Sintético', sku: 'OL-5W30', precoCusto: 22, precoVenda: 38, estoqueAtual: 34, estoqueMinimo: 10, unidade: 'L' },
        { nome: 'Filtro de óleo', sku: 'FL-OLE', precoCusto: 14, precoVenda: 28, estoqueAtual: 2, estoqueMinimo: 5, unidade: 'un' },
        { nome: 'Pastilha de freio dianteira', sku: 'PF-DT', precoCusto: 60, precoVenda: 110, estoqueAtual: 8, estoqueMinimo: 4, unidade: 'par' },
        { nome: 'Filtro de ar', sku: 'FL-AR', precoCusto: 18, precoVenda: 35, estoqueAtual: 3, estoqueMinimo: 5, unidade: 'un' },
        { nome: 'Correia dentada kit', sku: 'CD-KIT', precoCusto: 180, precoVenda: 320, estoqueAtual: 5, estoqueMinimo: 2, unidade: 'kit' },
      ],
    });
    console.log('📦 peças criadas');
  }

  console.log('✅ Seed concluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
