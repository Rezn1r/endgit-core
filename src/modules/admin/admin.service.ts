import { prisma } from "@endgit/database";

export class AdminService {
  async getUsers(page: number, limit: number, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    
    if (search) {
      where.OR = [
        { username: { contains: search, mode: "insensitive" } },
        { displayName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where, skip, take: limit, orderBy: { createdAt: "desc" },
        select: {
          id: true, username: true, displayName: true, email: true,
          avatarUrl: true, trustLevel: true, createdAt: true,
          weeklyBuildQuota: true, weeklyBuildCount: true, quotaResetAt: true,
          _count: { select: { plugins: true, reviews: true, ratings: true } }
        }
      }),
      prisma.user.count({ where })
    ]);

    return { users, total, totalPages: Math.ceil(total / limit) };
  }

  async updateUserTrustLevel(userId: string, trustLevel: string) {
    if (!["NEW", "TRUSTED", "FLAGGED", "ADMIN"].includes(trustLevel)) {
      throw new Error("Invalid trust level");
    }

    return await prisma.user.update({
      where: { id: userId },
      data: { trustLevel: trustLevel as any },
      select: { id: true, username: true, trustLevel: true }
    });
  }

  async updateUserQuota(userId: string, quota: number) {
    if (isNaN(quota) || quota < 1 || quota > 10000) {
      throw new Error("Quota must be between 1 and 10000");
    }

    return await prisma.user.update({
      where: { id: userId },
      data: { weeklyBuildQuota: quota },
      select: { id: true, username: true, weeklyBuildQuota: true }
    });
  }

  async getSystemStats() {
    const [users, plugins, builds, pendingReviews] = await Promise.all([
      prisma.user.count(),
      prisma.plugin.count(),
      prisma.build.count(),
      prisma.plugin.count({ where: { status: "PENDING_REVIEW" } }),
    ]);

    return { users, plugins, builds, pendingReviews };
  }

  async getPlugins(page: number, limit: number, search?: string, status?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { displayName: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
      ];
    }
    
    if (status) {
      where.status = status;
    }

    const [plugins, total] = await Promise.all([
      prisma.plugin.findMany({
        where, skip, take: limit, orderBy: { createdAt: "desc" },
        include: {
          author: { select: { username: true, displayName: true } },
          versions: {
            orderBy: { createdAt: "desc" },
            select: { id: true, version: true, status: true, createdAt: true }
          }
        }
      }),
      prisma.plugin.count({ where })
    ]);

    return { plugins, total, totalPages: Math.ceil(total / limit) };
  }

  async updatePluginStatus(pluginId: string, status: string) {
    if (!["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "SUSPENDED", "FLAGGED"].includes(status)) {
      throw new Error("Invalid plugin status");
    }

    return await prisma.plugin.update({
      where: { id: pluginId },
      data: { status: status as any },
      select: { id: true, slug: true, status: true, displayName: true }
    });
  }

  async updateVersionStatus(versionId: string, status: string) {
    if (!["PENDING", "APPROVED", "REJECTED"].includes(status)) {
      throw new Error("Invalid version status");
    }

    return await prisma.version.update({
      where: { id: versionId },
      data: { status: status as any },
      select: { id: true, version: true, status: true }
    });
  }

  async toggleFeatured(pluginId: string) {
    const plugin = await prisma.plugin.findUnique({ where: { id: pluginId }, select: { isFeatured: true } });
    if (!plugin) throw new Error("Plugin not found");

    return await prisma.plugin.update({
      where: { id: pluginId },
      data: { isFeatured: !plugin.isFeatured },
      select: { id: true, slug: true, displayName: true, isFeatured: true }
    });
  }
}

export const adminService = new AdminService();
