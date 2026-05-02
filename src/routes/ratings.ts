// ─────────────────────────────────────────────────────────
// Ratings Routes — Star ratings & comments for plugins
// ─────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { prisma } from "@endgit/database";
import { requireAuth, optionalAuth, AuthRequest } from "../middleware/auth";
import { sendNewRatingWebhook } from "../utils/discord";

export const ratingRouter: Router = Router();

/**
 * GET /api/v1/ratings/:slug — Get all ratings for a plugin
 */
ratingRouter.get("/:slug", async (req: Request, res: Response) => {
  try {
    const plugin = await prisma.plugin.findUnique({ where: { slug: String(req.params.slug) } });
    if (!plugin) return res.status(404).json({ success: false, error: "Plugin not found" });

    const page = parseInt(((req.query.page as any as string))) || 1;
    const limit = Math.min(parseInt(((req.query.limit as any as string))) || 20, 50);
    const skip = (page - 1) * limit;

    const [ratings, total] = await Promise.all([
      prisma.rating.findMany({
        where: { pluginId: plugin.id },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, trustLevel: true } } }
      }),
      prisma.rating.count({ where: { pluginId: plugin.id } })
    ]);

    res.json({ success: true, data: ratings, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to fetch ratings" });
  }
});

/**
 * GET /api/v1/ratings/:slug/summary — Rating summary (avg, distribution)
 */
ratingRouter.get("/:slug/summary", async (req: Request, res: Response) => {
  try {
    const plugin = await prisma.plugin.findUnique({ where: { slug: String(req.params.slug) } });
    if (!plugin) return res.status(404).json({ success: false, error: "Plugin not found" });

    const ratings = await prisma.rating.findMany({
      where: { pluginId: plugin.id },
      select: { score: true }
    });

    const total = ratings.length;
    const avg = total > 0 ? ratings.reduce((sum, r) => sum + r.score, 0) / total : 0;
    const distribution = [1, 2, 3, 4, 5].map(star => ({
      star,
      count: ratings.filter(r => r.score === star).length,
      percentage: total > 0 ? Math.round((ratings.filter(r => r.score === star).length / total) * 100) : 0
    }));

    res.json({ success: true, data: { average: Math.round(avg * 10) / 10, total, distribution } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to fetch rating summary" });
  }
});

/**
 * POST /api/v1/ratings/:slug — Submit a rating (1-5 stars + comment)
 */
ratingRouter.post("/:slug", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const plugin = await prisma.plugin.findUnique({ where: { slug: String(req.params.slug) } });
    if (!plugin) return res.status(404).json({ success: false, error: "Plugin not found" });


    const { score, comment } = req.body;
    if (!score || score < 1 || score > 5) {
      return res.status(400).json({ success: false, error: "Score must be between 1 and 5" });
    }

    const rating = await prisma.rating.upsert({
      where: { userId_pluginId: { userId: req.user!.id, pluginId: plugin.id } },
      create: {
        score,
        comment: comment || null,
        userId: req.user!.id,
        pluginId: plugin.id,
      },
      update: {
        score,
        comment: comment || null,
      },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, trustLevel: true } } }
    });

    // Update plugin's star count
    const avgResult = await prisma.rating.aggregate({
      where: { pluginId: plugin.id },
      _avg: { score: true },
      _count: true
    });
    await prisma.plugin.update({
      where: { id: plugin.id },
      data: { stars: Math.round((avgResult._avg.score || 0) * 20) } // Convert 1-5 to 0-100 scale
    });

    // Send Discord Webhook
    if (rating.user?.username) {
      await sendNewRatingWebhook(plugin, rating, rating.user.username);
    }

    res.status(201).json({ success: true, data: rating });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to submit rating" });
  }
});

/**
 * DELETE /api/v1/ratings/:slug — Delete own rating
 */
ratingRouter.delete("/:slug", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const plugin = await prisma.plugin.findUnique({ where: { slug: String(req.params.slug) } });
    if (!plugin) return res.status(404).json({ success: false, error: "Plugin not found" });

    await prisma.rating.deleteMany({
      where: { userId: req.user!.id, pluginId: plugin.id }
    });

    res.json({ success: true, message: "Rating deleted" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to delete rating" });
  }
});

/**
 * POST /api/v1/ratings/:slug/:ratingId/reply — Plugin owner replies to a rating
 */
ratingRouter.post("/:slug/:ratingId/reply", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const plugin = await prisma.plugin.findUnique({ where: { slug: String(req.params.slug) } });
    if (!plugin) return res.status(404).json({ success: false, error: "Plugin not found" });

    // Only plugin owner can reply
    if (plugin.authorId !== req.user!.id) {
      return res.status(403).json({ success: false, error: "Only the plugin author can reply to ratings" });
    }

    const { reply } = req.body;
    if (!reply || reply.trim().length === 0) {
      return res.status(400).json({ success: false, error: "Reply comment cannot be empty" });
    }

    const rating = await prisma.rating.update({
      where: { id: String(req.params.ratingId) },
      data: {
        ownerReply: reply.trim(),
        repliedAt: new Date(),
      },
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, trustLevel: true } } }
    });

    res.json({ success: true, data: rating });
  } catch (error: any) {
    console.error("Reply error:", error);
    res.status(500).json({ success: false, error: "Failed to submit reply" });
  }
});
