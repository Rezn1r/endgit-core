const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const stuck = await prisma.build.updateMany({
    where: { status: { in: ["QUEUED", "RUNNING"] } },
    data: { status: "FAILED", logs: "Build failed: Worker process terminated unexpectedly." }
  });
  console.log("Fixed", stuck.count, "stuck builds.");
}
main().catch(console.error).finally(() => prisma.$disconnect());
