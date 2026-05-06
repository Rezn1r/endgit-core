import { prisma } from "@endgit/database";
import { sendPluginApprovedWebhook } from "../../utils/discord";
import { sendRejectionEmail, sendApprovalEmail } from "../../utils/mailer";

export class ReviewsService {
  async getAutoChecks(slug: string) {
    const plugin = await prisma.plugin.findUnique({ where: { slug } });
    if (!plugin) throw new Error("Plugin not found");

    return await prisma.autoCheck.findMany({
      where: { pluginId: plugin.id },
      orderBy: { createdAt: "desc" },
    });
  }

  async getReviews(slug: string) {
    const plugin = await prisma.plugin.findUnique({ where: { slug } });
    if (!plugin) throw new Error("Plugin not found");

    return await prisma.review.findMany({
      where: { pluginId: plugin.id },
      orderBy: { createdAt: "desc" },
      include: { reviewer: { select: { username: true, avatarUrl: true } } },
    });
  }

  async submitReview(slug: string, reviewerId: string, data: any) {
    const plugin = await prisma.plugin.findUnique({
      where: { slug },
      include: { author: { select: { id: true, username: true, email: true } } }
    });
    if (!plugin) throw new Error("Plugin not found");

    const { decision, comment, codeClean, noBackdoor, rulesOk, versionId } = data;
    if (!decision) throw new Error("decision is required");

    const review = await prisma.review.create({
      data: {
        decision, comment: comment || null, codeClean: codeClean ?? null,
        noBackdoor: noBackdoor ?? null, rulesOk: rulesOk ?? null,
        reviewerId, pluginId: plugin.id,
      },
      include: { reviewer: { select: { username: true, avatarUrl: true } } },
    });

    if (versionId) {
      const newVersionStatus = decision === "APPROVED" ? "APPROVED" : decision === "REJECTED" ? "REJECTED" : "PENDING";
      await prisma.version.update({ where: { id: versionId }, data: { status: newVersionStatus } });
    } else {
      let newPluginStatus: string;
      if (decision === "APPROVED") newPluginStatus = "APPROVED";
      else if (decision === "REJECTED") {
        const approvedVersionCount = await prisma.version.count({ where: { pluginId: plugin.id, status: "APPROVED" } });
        newPluginStatus = approvedVersionCount > 0 ? "APPROVED" : "REJECTED";
      } else newPluginStatus = "PENDING_REVIEW";
      
      await prisma.plugin.update({ where: { id: plugin.id }, data: { status: newPluginStatus as any } });
      
      const latestVersion = await prisma.version.findFirst({ where: { pluginId: plugin.id }, orderBy: { createdAt: 'desc' } });
      
      if (latestVersion) {
        const newVersionStatus = decision === "APPROVED" ? "APPROVED" : decision === "REJECTED" ? "REJECTED" : "PENDING";
        await prisma.version.update({ where: { id: latestVersion.id }, data: { status: newVersionStatus } });

        if (newVersionStatus === "APPROVED") {
          const fullPlugin = await prisma.plugin.findUnique({ where: { id: plugin.id }, include: { author: true } });
          const fullVersion = await prisma.version.findUnique({ where: { id: latestVersion.id }, include: { producers: true } });
          if (fullPlugin && fullVersion && review.reviewer?.username) {
            await sendPluginApprovedWebhook(fullPlugin, fullVersion, review.reviewer.username);
          }
        }

        const reviewerUsername = review.reviewer?.username || "Admin";
        const authorEmail = plugin.author?.email;
        const authorUsername = plugin.author?.username || "Developer";

        if (authorEmail) {
          if (decision === "REJECTED") {
            await sendRejectionEmail({
              to: authorEmail, authorUsername, pluginName: plugin.displayName,
              pluginSlug: plugin.slug, version: latestVersion.version,
              submittedAt: latestVersion.createdAt.toISOString(), reviewerUsername,
              reason: comment || "Your plugin did not meet the submission requirements.",
            });
          } else if (decision === "APPROVED") {
            await sendApprovalEmail({
              to: authorEmail, authorUsername, pluginName: plugin.displayName,
              pluginSlug: plugin.slug, version: latestVersion.version, reviewerUsername,
            });
          }
        }
      }
    }
    return review;
  }

  async getReviewQueue() {
    return await prisma.plugin.findMany({
      where: {
        OR: [{ status: "PENDING_REVIEW" }, { versions: { some: { status: "PENDING" } } }]
      },
      orderBy: { createdAt: "asc" },
      include: {
        author: { select: { username: true, avatarUrl: true } },
        versions: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
  }
}

export const reviewsService = new ReviewsService();
