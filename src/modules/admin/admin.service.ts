import { prisma } from "@endgit/database";
import { sendRejectionEmail } from "../../utils/mailer";

const NEGATIVE_STATUSES = ["REJECTED", "SUSPENDED", "FLAGGED"];

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

  async updatePluginStatus(pluginId: string, status: string, reason?: string, adminUser?: any) {
    if (!["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "SUSPENDED", "FLAGGED"].includes(status)) {
      throw new Error("Invalid plugin status");
    }

    const plugin = await prisma.plugin.findUnique({
      where: { id: pluginId },
      include: {
        author: { select: { id: true, username: true, email: true } },
        versions: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    if (!plugin) throw new Error("Plugin not found");

    const oldStatus = plugin.status;
    const isNegative = NEGATIVE_STATUSES.includes(status);

    // Persist the status change + reason
    const updated = await prisma.plugin.update({
      where: { id: pluginId },
      data: {
        status: status as any,
        statusReason: isNegative ? (reason || null) : null,
        // Clear reviewBuildId on rejection just like the review pipeline does
        ...(status === "REJECTED" && { reviewBuildId: null }),
      },
      select: { id: true, slug: true, status: true, statusReason: true, displayName: true },
    });

    // When transitioning from APPROVED to a negative status, clear isLatest flags
    // so the plugin fully disappears from public version listings
    if (oldStatus === "APPROVED" && isNegative) {
      await prisma.version.updateMany({
        where: { pluginId, isLatest: true },
        data: { isLatest: false },
      });
    }

    // Create audit log entry
    if (adminUser) {
      await prisma.moderationLog.create({
        data: {
          action: "PLUGIN_STATUS_CHANGE",
          targetType: "PLUGIN",
          targetId: pluginId,
          oldStatus,
          newStatus: status,
          reason: isNegative ? (reason || null) : null,
          actorId: adminUser.id,
          pluginId,
        },
      });
    }

    // Send notification email to the plugin author for negative status changes
    if (isNegative && plugin.author?.email) {
      const latestVersion = plugin.versions[0];
      sendRejectionEmail({
        to: plugin.author.email,
        authorUsername: plugin.author.username || "Developer",
        pluginName: plugin.displayName,
        pluginSlug: plugin.slug,
        version: latestVersion?.version || "N/A",
        submittedAt: latestVersion?.createdAt?.toISOString() || new Date().toISOString(),
        reviewerUsername: adminUser?.username || "Admin",
        reason: reason || `Your plugin has been ${status.toLowerCase()} by an administrator.`,
      }).catch((err: any) => console.error("[Admin] Failed to send status change email:", err));
    }

    return updated;
  }

  async updateVersionStatus(versionId: string, status: string, reason?: string, adminUser?: any) {
    if (!["PENDING", "APPROVED", "REJECTED"].includes(status)) {
      throw new Error("Invalid version status");
    }

    const version = await prisma.version.findUnique({
      where: { id: versionId },
      include: {
        plugin: {
          include: { author: { select: { id: true, username: true, email: true } } },
        },
      },
    });

    if (!version) throw new Error("Version not found");

    const oldStatus = version.status;
    const isNegative = status === "REJECTED";

    // Persist the status change + reason
    const updated = await prisma.version.update({
      where: { id: versionId },
      data: {
        status: status as any,
        statusReason: isNegative ? (reason || null) : null,
        // Clear isLatest if rejecting an approved version
        ...(oldStatus === "APPROVED" && isNegative && { isLatest: false }),
      },
      select: { id: true, version: true, status: true, statusReason: true },
    });

    // Create audit log entry
    if (adminUser) {
      await prisma.moderationLog.create({
        data: {
          action: "VERSION_STATUS_CHANGE",
          targetType: "VERSION",
          targetId: versionId,
          oldStatus,
          newStatus: status,
          reason: isNegative ? (reason || null) : null,
          actorId: adminUser.id,
          pluginId: version.pluginId,
        },
      });
    }

    // Send notification email when rejecting a version
    if (isNegative && version.plugin?.author?.email) {
      sendRejectionEmail({
        to: version.plugin.author.email,
        authorUsername: version.plugin.author.username || "Developer",
        pluginName: version.plugin.displayName,
        pluginSlug: version.plugin.slug,
        version: version.version,
        submittedAt: version.createdAt.toISOString(),
        reviewerUsername: adminUser?.username || "Admin",
        reason: reason || "This version has been rejected by an administrator.",
      }).catch((err: any) => console.error("[Admin] Failed to send version rejection email:", err));
    }

    return updated;
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
