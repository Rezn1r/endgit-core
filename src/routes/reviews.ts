// Review Routes
import { Router, Response } from "express";
import { prisma } from "@endgit/database";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";

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
reviewRouter.post("/:slug", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const plugin = await prisma.plugin.findUnique({ where: { slug: String(req.params.slug) } });
    if (!plugin) return res.status(404).json({ success: false, error: "Plugin not found" });

    const { decision, comment, codeClean, noBackdoor, rulesOk } = req.body;
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

    // Update plugin status based on decision
    const newStatus = decision === "APPROVED" ? "APPROVED" : decision === "REJECTED" ? "REJECTED" : "PENDING_REVIEW";
    await prisma.plugin.update({ where: { id: plugin.id }, data: { status: newStatus } });

    res.status(201).json({ success: true, data: review });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to submit review" });
  }
});

// GET /api/v1/reviews/admin/queue — Pending review queue
reviewRouter.get("/admin/queue", requireAuth, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const plugins = await prisma.plugin.findMany({
      where: { status: "PENDING_REVIEW" },
      orderBy: { createdAt: "asc" },
      include: {
        author: { select: { username: true, displayName: true, avatarUrl: true, trustLevel: true } },
        versions: { where: { isLatest: true }, select: { version: true }, take: 1 },
      },
    });
    res.json({ success: true, data: plugins });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to get review queue" });
  }
});
