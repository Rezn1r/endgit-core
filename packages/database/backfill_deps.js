const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const version = await prisma.version.findFirst({
    where: { plugin: { slug: "testplugin" }, isLatest: true },
    select: { id: true }
  });
  if (!version) { console.log("No version found"); return; }
  
  // Clear old deps
  await prisma.dependency.deleteMany({ where: { versionId: version.id } });
  
  // Insert from pyproject.toml
  await prisma.dependency.createMany({
    data: [
      { name: "typing_extensions", version: ">=4.0", versionId: version.id },
      { name: "endstone", version: ">=0.5", versionId: version.id },
    ]
  });
  
  const deps = await prisma.dependency.findMany({ where: { versionId: version.id } });
  console.log("Created", deps.length, "dependencies:", deps.map(d => `${d.name} ${d.version}`));
}
main().catch(console.error).finally(() => prisma.$disconnect());
