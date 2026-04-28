const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const plugin = await prisma.plugin.findFirst({ where: { slug: "testplugin" }, include: { versions: true } });
  console.log(plugin.versions.map(v => v.version));
}
main().catch(console.error).finally(() => prisma.$disconnect());
