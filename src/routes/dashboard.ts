// Dashboard Routes — Developer stats
import { Router, Response } from "express";
import { prisma } from "@endgit/database";
import { requireAuth, AuthRequest } from "../middleware/auth";

export const dashboardRouter: Router = Router();

// GET /api/v1/dashboard/status — Check if user has installed the GitHub App
dashboardRouter.get("/status", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.account.findFirst({
      where: { userId: req.user!.id, provider: "github" },
      select: { access_token: true }
    });
    
    let hasAppInstalled = false;
    
    if (account?.access_token) {
      const ghRes = await fetch("https://api.github.com/user/installations", {
        headers: {
          Authorization: `Bearer ${account.access_token}`,
          Accept: "application/vnd.github.v3+json"
        }
      });
      
      if (ghRes.ok) {
        const ghData = await ghRes.json();
        const appIdStr = process.env.GITHUB_APP_ID || "3517676";
        const appId = parseInt(appIdStr);
        const appSlug = process.env.GITHUB_APP_SLUG || "endgit-local-dev";
        
        hasAppInstalled = ghData.installations?.some((inst: any) => 
          inst.app_id === appId || 
          inst.app_slug === appSlug || 
          (inst.app_slug && inst.app_slug.includes("endgit"))
        ) || false;
      } else {
        console.error("Failed to fetch GitHub installations:", ghRes.status, await ghRes.text());
      }
    }
    // Fetch user quota info
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { weeklyBuildQuota: true, weeklyBuildCount: true, quotaResetAt: true }
    });

    let quota = { used: 0, limit: 50, resetsAt: new Date().toISOString() };
    if (user) {
      const now = new Date();
      let used = user.weeklyBuildCount;
      let resetsAt = user.quotaResetAt;

      // If reset time has passed, show as 0 used
      if (now >= user.quotaResetAt) {
        used = 0;
        resetsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      }

      quota = { used, limit: user.weeklyBuildQuota, resetsAt: resetsAt.toISOString() };
    }
    
    res.json({ success: true, data: { hasAppInstalled, quota } });
  } catch (error: any) {
    console.error("Status check error:", error);
    res.status(500).json({ success: false, error: "Failed to check status" });
  }
});

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
