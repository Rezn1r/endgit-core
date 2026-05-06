import { prisma } from "@endgit/database";

export class ModerationService {
  async reportPlugin(slug: string, reporterId: string, reason: string, details?: string) {
    const plugin = await prisma.plugin.findUnique({ where: { slug } });
    if (!plugin) throw new Error("Plugin not found");

    if (!reason) throw new Error("reason is required");

    const report = await prisma.report.create({
      data: { reason: reason as any, details: details || null, reporterId, pluginId: plugin.id },
    });

    const unresolvedCount = await prisma.report.count({ where: { pluginId: plugin.id, resolved: false } });
    if (unresolvedCount >= 3 && plugin.status !== "FLAGGED") {
      await prisma.plugin.update({ where: { id: plugin.id }, data: { status: "FLAGGED" } });
    }

    return report;
  }

  async ratePlugin(slug: string, userId: string, score: number, comment?: string) {
    const plugin = await prisma.plugin.findUnique({ where: { slug } });
    if (!plugin) throw new Error("Plugin not found");

    if (!score || score < 1 || score > 5) throw new Error("score must be 1-5");

    return await prisma.rating.upsert({
      where: { userId_pluginId: { userId, pluginId: plugin.id } },
      update: { score, comment: comment || null },
      create: { score, comment: comment || null, userId, pluginId: plugin.id },
    });
  }

  async getRatings(slug: string) {
    const plugin = await prisma.plugin.findUnique({ where: { slug } });
    if (!plugin) throw new Error("Plugin not found");

    return await prisma.rating.findMany({
      where: { pluginId: plugin.id },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { username: true, avatarUrl: true } } },
    });
  }

  async updateTrustLevel(userId: string, trustLevel: string) {
    if (!["NEW", "TRUSTED", "FLAGGED", "ADMIN"].includes(trustLevel)) {
      throw new Error("Invalid trust level");
    }

    return await prisma.user.update({
      where: { id: userId },
      data: { trustLevel: trustLevel as any },
      select: { id: true, username: true, trustLevel: true },
    });
  }
}

export const moderationService = new ModerationService();
