// Review Routes
import { Router, Response } from "express";
import { prisma } from "@endgit/database";
import { requireAuth, requireAdmin, requireReviewer, AuthRequest } from "../middleware/auth";
import { sendPluginApprovedWebhook } from "../utils/discord";
import { sendRejectionEmail, sendApprovalEmail } from "../utils/mailer";

export const reviewRouter: Router = Router();

// GET /api/v1/reviews/:slug/checks — Auto-check results
reviewRouter.get("/:slug/checks", async (req, res: Response) => {
  try {
    const plugin = await prisma.plugin.findUnique({ where: { slug: String(req.params.slug) } });
    if (!plugin) return res.status(404).json({ success: false, error: "Plugin not found" });

    const checks = await prisma.autoCheck.findMany({
      where: { pluginId: plugin.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: checks });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to get checks" });
  }
});

// GET /api/v1/reviews/:slug — Review history
reviewRouter.get("/:slug", async (req, res: Response) => {
  try {
    const plugin = await prisma.plugin.findUnique({ where: { slug: String(req.params.slug) } });
    if (!plugin) return res.status(404).json({ success: false, error: "Plugin not found" });

    const reviews = await prisma.review.findMany({
      where: { pluginId: plugin.id },
      orderBy: { createdAt: "desc" },
      include: { reviewer: { select: { username: true, avatarUrl: true } } },
    });
    res.json({ success: true, data: reviews });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to get reviews" });
  }
});

// POST /api/v1/reviews/:slug — Submit human review (admin)
// Accepts optional versionId to approve/reject a specific version
reviewRouter.post("/:slug", requireAuth, requireReviewer, async (req: AuthRequest, res: Response) => {
  try {
    const plugin = await prisma.plugin.findUnique({
      where: { slug: String(req.params.slug) },
      include: { author: { select: { id: true, username: true, email: true } } }
    });
    if (!plugin) return res.status(404).json({ success: false, error: "Plugin not found" });

    const { decision, comment, codeClean, noBackdoor, rulesOk, versionId } = req.body;
    if (!decision) return res.status(400).json({ success: false, error: "decision is required" });

    const review = await prisma.review.create({
      data: {
        decision,
        comment: comment || null,
        codeClean: codeClean ?? null,
        noBackdoor: noBackdoor ?? null,
        rulesOk: rulesOk ?? null,
        reviewerId: req.user!.id,
        pluginId: plugin.id,
      },
      include: { reviewer: { select: { username: true, avatarUrl: true } } },
    });

    // If a specific versionId was provided, update ONLY that version's status
    if (versionId) {
      const newVersionStatus = decision === "APPROVED" ? "APPROVED" : decision === "REJECTED" ? "REJECTED" : "PENDING";
      await prisma.version.update({
        where: { id: versionId },
        data: { status: newVersionStatus }
      });
    } else {
      // Determine new plugin status based on decision
      let newPluginStatus: string;
      if (decision === "APPROVED") {
        newPluginStatus = "APPROVED";
      } else if (decision === "REJECTED") {
        // Check if plugin has any other approved versions — if so, keep plugin APPROVED
        const approvedVersionCount = await prisma.version.count({
          where: { pluginId: plugin.id, status: "APPROVED" }
        });
        newPluginStatus = approvedVersionCount > 0 ? "APPROVED" : "REJECTED";
      } else {
        newPluginStatus = "PENDING_REVIEW";
      }
      await prisma.plugin.update({ where: { id: plugin.id }, data: { status: newPluginStatus as any } });
      
      // Also approve/reject the latest version if we are approving the plugin
      const latestVersion = await prisma.version.findFirst({
        where: { pluginId: plugin.id },
        orderBy: { createdAt: 'desc' }
      });
      if (latestVersion) {
        const newVersionStatus = decision === "APPROVED" ? "APPROVED" : decision === "REJECTED" ? "REJECTED" : "PENDING";
        await prisma.version.update({
          where: { id: latestVersion.id },
          data: { status: newVersionStatus }
        });

        // Send Discord Webhook on approval
        if (newVersionStatus === "APPROVED") {
          const fullPlugin = await prisma.plugin.findUnique({
            where: { id: plugin.id },
            include: { author: true }
          });
          const fullVersion = await prisma.version.findUnique({
            where: { id: latestVersion.id },
            include: { producers: true }
          });
          if (fullPlugin && fullVersion && review.reviewer?.username) {
            await sendPluginApprovedWebhook(fullPlugin, fullVersion, review.reviewer.username);
          }
        }

        // ── Email Notifications ──────────────────────
        const reviewerUsername = review.reviewer?.username || "Admin";
        const authorEmail = plugin.author?.email;
        const authorUsername = plugin.author?.username || "Developer";

        if (authorEmail) {
          if (decision === "REJECTED") {
            await sendRejectionEmail({
              to: authorEmail,
              authorUsername,
              pluginName: plugin.displayName,
              pluginSlug: plugin.slug,
              version: latestVersion.version,
              submittedAt: latestVersion.createdAt.toISOString(),
              reviewerUsername,
              reason: comment || "Your plugin did not meet the submission requirements. Please review the guidelines and try again.",
            });
          } else if (decision === "APPROVED") {
            await sendApprovalEmail({
              to: authorEmail,
              authorUsername,
              pluginName: plugin.displayName,
              pluginSlug: plugin.slug,
              version: latestVersion.version,
              reviewerUsername,
            });
          }
        }
      }
    }

    res.status(201).json({ success: true, data: review });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to submit review" });
  }
});

// GET /api/v1/reviews/admin/queue — Pending review queue (returns plugins)
reviewRouter.get("/admin/queue", requireAuth, requireReviewer, async (_req: AuthRequest, res: Response) => {
  try {
    const pendingPlugins = await prisma.plugin.findMany({
      where: {
        OR: [
          { status: "PENDING_REVIEW" },
          { versions: { some: { status: "PENDING" } } }
        ]
      },
      orderBy: { createdAt: "asc" },
      include: {
        author: { select: { username: true, avatarUrl: true } },
        versions: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    res.json({ success: true, data: pendingPlugins });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to get review queue" });
  }
});
