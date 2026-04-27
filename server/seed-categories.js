const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const cats = [
  { id: 'sys-venda-animais',       farmId: null, name: 'Venda de Animais',           group: 'Rebanho',        type: 'ENTRADA', isSystem: true, isActive: true },
  { id: 'sys-venda-reprodutores',  farmId: null, name: 'Venda de Reprodutores',      group: 'Rebanho',        type: 'ENTRADA', isSystem: true, isActive: true },
  { id: 'sys-outras-receitas',     farmId: null, name: 'Outras Receitas',            group: 'Administrativo', type: 'ENTRADA', isSystem: true, isActive: true },
  { id: 'sys-compra-animais',      farmId: null, name: 'Compra de Animais',          group: 'Rebanho',        type: 'SAIDA',   isSystem: true, isActive: true },
  { id: 'sys-compra-reprodutores', farmId: null, name: 'Compra de Reprodutores',     group: 'Rebanho',        type: 'SAIDA',   isSystem: true, isActive: true },
  { id: 'sys-vacinas',             farmId: null, name: 'Vacinas',                    group: 'Sanidade',       type: 'SAIDA',   isSystem: true, isActive: true },
  { id: 'sys-vermifugos',          farmId: null, name: 'Vermífugos',                 group: 'Sanidade',       type: 'SAIDA',   isSystem: true, isActive: true },
  { id: 'sys-tratamentos',         farmId: null, name: 'Tratamentos Veterinários',   group: 'Sanidade',       type: 'SAIDA',   isSystem: true, isActive: true },
  { id: 'sys-racao',               farmId: null, name: 'Ração / Concentrado',        group: 'Nutrição',       type: 'SAIDA',   isSystem: true, isActive: true },
  { id: 'sys-suplementacao',       farmId: null, name: 'Suplementação Mineral',      group: 'Nutrição',       type: 'SAIDA',   isSystem: true, isActive: true },
  { id: 'sys-pastagem',            farmId: null, name: 'Pastagem e Forragem',        group: 'Nutrição',       type: 'SAIDA',   isSystem: true, isActive: true },
  { id: 'sys-equip-aquis',         farmId: null, name: 'Aquisição de Equipamentos',  group: 'Equipamentos',   type: 'SAIDA',   isSystem: true, isActive: true },
  { id: 'sys-equip-manut',         farmId: null, name: 'Manutenção de Equipamentos', group: 'Equipamentos',   type: 'SAIDA',   isSystem: true, isActive: true },
  { id: 'sys-salarios',            farmId: null, name: 'Salários',                   group: 'Mão de Obra',    type: 'SAIDA',   isSystem: true, isActive: true },
  { id: 'sys-servicos-terc',       farmId: null, name: 'Serviços Terceirizados',     group: 'Mão de Obra',    type: 'SAIDA',   isSystem: true, isActive: true },
  { id: 'sys-energia',             farmId: null, name: 'Energia Elétrica',           group: 'Infraestrutura', type: 'SAIDA',   isSystem: true, isActive: true },
  { id: 'sys-combustivel',         farmId: null, name: 'Combustível',                group: 'Infraestrutura', type: 'SAIDA',   isSystem: true, isActive: true },
  { id: 'sys-infra-manut',         farmId: null, name: 'Manutenção Geral',           group: 'Infraestrutura', type: 'SAIDA',   isSystem: true, isActive: true },
  { id: 'sys-despesas-gerais',     farmId: null, name: 'Despesas Gerais',            group: 'Administrativo', type: 'SAIDA',   isSystem: true, isActive: true },
];

async function main() {
  const result = await prisma.accountCategory.createMany({
    data: cats,
    skipDuplicates: true,
  });
  console.log(`✅ Categorias inseridas: ${result.count}`);
}

main()
  .catch(e => { console.error('❌ Erro:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
