import { prisma } from "@endgit/database";
import { repoconfigService } from "../repoconfig/repoconfig.service";

export class DashboardService {
  async getStatus(userId: string) {
    const account = await prisma.account.findFirst({
      where: { userId, provider: "github" },
      select: { access_token: true }
    });
    
    let hasAppInstalled = false;
    let githubTokenExpired = false;
    
    if (account?.access_token) {
      const ghRes = await fetch("https://api.github.com/user/installations", {
        headers: {
          Authorization: `Bearer ${account.access_token}`,
          Accept: "application/vnd.github.v3+json"
        }
      });
      
      if (ghRes.ok) {
        const ghData = await ghRes.json() as any;
        const appIdStr = process.env.GITHUB_APP_ID || "3517676";
        const appId = parseInt(appIdStr);
        const appSlug = process.env.GITHUB_APP_SLUG || "endgit-local-dev";
        
        hasAppInstalled = ghData.installations?.some((inst: any) => 
          inst.app_id === appId || 
          inst.app_slug === appSlug || 
          (inst.app_slug && inst.app_slug.includes("endgit"))
        ) || false;
      } else {
        if (ghRes.status === 401) {
          githubTokenExpired = true;
        }
        console.error("Failed to fetch GitHub installations:", ghRes.status, await ghRes.text().catch(() => ""));
      }
    } else {
      githubTokenExpired = true;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { weeklyBuildQuota: true, weeklyBuildCount: true, quotaResetAt: true }
    });

    let quota = { used: 0, limit: 50, resetsAt: new Date().toISOString() };
    if (user) {
      const now = new Date();
      let used = user.weeklyBuildCount;
      let resetsAt = user.quotaResetAt;

      if (now >= user.quotaResetAt) {
        used = 0;
        resetsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      }

      quota = { used, limit: user.weeklyBuildQuota, resetsAt: resetsAt.toISOString() };
    }
    
    return { hasAppInstalled, githubTokenExpired, quota };
  }

  async getMyPlugins(userId: string) {
    const plugins = await prisma.plugin.findMany({
      where: { authorId: userId },
      orderBy: { updatedAt: "desc" },
      include: {
        versions: { where: { isLatest: true }, select: { version: true }, take: 1 },
        _count: { select: { versions: true, ratings: true, reports: true } },
      },
    });

    // Note: Callers can use getPluginConfig() to enrich individual plugins with
    // .endgit.yml overrides (display name, icon, description). Not done here to
    // avoid N+1 GitHub API calls for the full list.
    return plugins.map((p: any) => ({
      ...p,
      latestVersion: p.versions[0]?.version || null,
      versions: undefined,
      versionCount: p._count.versions,
      ratingCount: p._count.ratings,
      reportCount: p._count.reports,
      _count: undefined,
    }));
  }

  /**
   * Fetch the .endgit.yml config for a specific plugin's repository.
   * Returns the parsed config or null if not found/invalid.
   */
  async getPluginConfig(pluginId: string, repoUrl: string, authorId: string) {
    try {
      const accessToken = await repoconfigService.getAccessToken(authorId);
      if (!accessToken) return null;

      // Parse owner/repo from repoUrl (e.g., https://github.com/owner/repo)
      const match = repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
      if (!match) return null;

      const [, owner, repo] = match;
      return await repoconfigService.fetchConfigFromRepo(accessToken, owner, repo);
    } catch {
      return null;
    }
  }

  async getMyStats(userId: string) {
    const [totalPlugins, pluginAgg, totalVersions, pendingReviews] = await Promise.all([
      prisma.plugin.count({ where: { authorId: userId } }),
      prisma.plugin.aggregate({ where: { authorId: userId }, _sum: { downloads: true } }),
      prisma.version.count({ where: { plugin: { authorId: userId } } }),
      prisma.plugin.count({ where: { authorId: userId, status: "PENDING_REVIEW" } }),
    ]);

    return {
      totalPlugins,
      totalDownloads: pluginAgg._sum.downloads || 0,
      totalVersions,
      pendingReviews,
    };
  }
}

export const dashboardService = new DashboardService();
