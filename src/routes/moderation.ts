// Moderation Routes — Reports, Ratings, Trust
import { Router, Response } from "express";
import { prisma } from "@endgit/database";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";

export const moderationRouter: Router = Router();

// POST /api/v1/moderation/:slug/report — Report plugin
moderationRouter.post("/:slug/report", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const plugin = await prisma.plugin.findUnique({ where: { slug: String(req.params.slug) } });
    if (!plugin) return res.status(404).json({ success: false, error: "Plugin not found" });

    const { reason, details } = req.body;
    if (!reason) return res.status(400).json({ success: false, error: "reason is required" });

    const report = await prisma.report.create({
      data: { reason, details: details || null, reporterId: req.user!.id, pluginId: plugin.id },
    });

    // Auto-flag if 3+ unresolved reports
    const unresolvedCount = await prisma.report.count({ where: { pluginId: plugin.id, resolved: false } });
    if (unresolvedCount >= 3 && plugin.status !== "FLAGGED") {
      await prisma.plugin.update({ where: { id: plugin.id }, data: { status: "FLAGGED" } });
    }

    res.status(201).json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to submit report" });
  }
});

// POST /api/v1/moderation/:slug/rate — Rate plugin
moderationRouter.post("/:slug/rate", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const plugin = await prisma.plugin.findUnique({ where: { slug: String(req.params.slug) } });
    if (!plugin) return res.status(404).json({ success: false, error: "Plugin not found" });

    const { score, comment } = req.body;
    if (!score || score < 1 || score > 5) return res.status(400).json({ success: false, error: "score must be 1-5" });

    const rating = await prisma.rating.upsert({
      where: { userId_pluginId: { userId: req.user!.id, pluginId: plugin.id } },
      update: { score, comment: comment || null },
      create: { score, comment: comment || null, userId: req.user!.id, pluginId: plugin.id },
    });

    res.json({ success: true, data: rating });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to submit rating" });
  }
});

// GET /api/v1/moderation/:slug/ratings — Get ratings
moderationRouter.get("/:slug/ratings", async (req, res: Response) => {
  try {
    const plugin = await prisma.plugin.findUnique({ where: { slug: String(req.params.slug) } });
    if (!plugin) return res.status(404).json({ success: false, error: "Plugin not found" });

    const ratings = await prisma.rating.findMany({
      where: { pluginId: plugin.id },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { username: true, avatarUrl: true } } },
    });
    res.json({ success: true, data: ratings });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to get ratings" });
  }
});

// PATCH /api/v1/moderation/trust/:userId — Update trust level (admin)
moderationRouter.patch("/trust/:userId", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { trustLevel } = req.body;
    if (!["NEW", "TRUSTED", "FLAGGED", "ADMIN"].includes(trustLevel)) {
      return res.status(400).json({ success: false, error: "Invalid trust level" });
    }

    const user = await prisma.user.update({
      where: { id: String(req.params.userId) },
      data: { trustLevel },
      select: { id: true, username: true, trustLevel: true },
    });

    res.json({ success: true, data: user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to update trust level" });
  }
});
