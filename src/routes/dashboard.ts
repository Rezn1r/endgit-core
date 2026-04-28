// Dashboard Routes — Developer stats
import { Router, Response } from "express";
import { prisma } from "@endgit/database";
import { requireAuth, AuthRequest } from "../middleware/auth";

export const dashboardRouter: Router = Router();

// GET /api/v1/dashboard/plugins — My plugins
dashboardRouter.get("/plugins", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const plugins = await prisma.plugin.findMany({
      where: { authorId: req.user!.id },
      orderBy: { updatedAt: "desc" },
      include: {
        versions: { where: { isLatest: true }, select: { version: true }, take: 1 },
        _count: { select: { versions: true, ratings: true, reports: true } },
      },
    });

    const data = plugins.map((p: any) => ({
      ...p,
      latestVersion: p.versions[0]?.version || null,
      versions: undefined,
      versionCount: p._count.versions,
      ratingCount: p._count.ratings,
      reportCount: p._count.reports,
      _count: undefined,
    }));

    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to get plugins" });
  }
});

// GET /api/v1/dashboard/stats — Developer stats summary
dashboardRouter.get("/stats", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [totalPlugins, pluginAgg, totalVersions, pendingReviews] = await Promise.all([
      prisma.plugin.count({ where: { authorId: req.user!.id } }),
      prisma.plugin.aggregate({ where: { authorId: req.user!.id }, _sum: { downloads: true } }),
      prisma.version.count({ where: { plugin: { authorId: req.user!.id } } }),
      prisma.plugin.count({ where: { authorId: req.user!.id, status: "PENDING_REVIEW" } }),
    ]);

    res.json({
      success: true,
      data: {
        totalPlugins,
        totalDownloads: pluginAgg._sum.downloads || 0,
        totalVersions,
        pendingReviews,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to get stats" });
  }
});
