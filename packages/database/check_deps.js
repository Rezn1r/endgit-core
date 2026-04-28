const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const deps = await prisma.dependency.findMany({ 
    include: { parentVersion: { select: { version: true, plugin: { select: { slug: true } } } } }
  });
  console.log(JSON.stringify(deps, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
