const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const plugin = await prisma.plugin.findFirst({ where: { slug: "testplugin" }, include: { builds: true } });
  console.log("Plugin Status:", plugin.status);
  console.log("Review Build ID:", plugin.reviewBuildId);
  console.log("Builds:");
  plugin.builds.forEach(b => console.log(`  #${b.buildNumber} - ${b.id} - ${b.status}`));
}
main().catch(console.error).finally(() => prisma.$disconnect());
