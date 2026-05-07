import { prisma } from "@endgit/database";
import { Queue } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const buildQueue = new Queue("build-jobs", { connection });

export class PluginsService {
  async listPlugins(query: any) {
    const page = Math.max(1, parseInt(query.page as string) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(query.pageSize as string) || 20));
    const sort = (query.sort as string) || "downloads";
    const order = (query.order as string) || "desc";
    const tag = query.tag as string;
    const type = query.type as string;
    const search = query.q as string;
    const category = query.category as string;

    const where: any = { status: "APPROVED" };

    if (tag) where.tags = { has: tag };
    if (category) where.tags = { has: category };
    if (type && ["PYTHON", "CPP", "BOTH"].includes(type)) where.pluginType = type;

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { displayName: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const orderBy: any = {};
    if (sort === "downloads") orderBy.downloads = order;
    else if (sort === "stars") orderBy.stars = order;
    else if (sort === "date") orderBy.createdAt = order;
    else if (sort === "name") orderBy.displayName = order;
    else if (sort === "trending") orderBy.downloads = "desc";
    else orderBy.downloads = "desc";

    const [plugins, total] = await Promise.all([
      prisma.plugin.findMany({
        where, orderBy, skip: (page - 1) * pageSize, take: pageSize,
        include: {
          author: { select: { username: true, displayName: true, avatarUrl: true } },
          versions: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, select: { version: true }, take: 1 },
        },
      }),
      prisma.plugin.count({ where }),
    ]);

    const data = plugins.map((p: any) => ({
      ...p,
      latestVersion: p.versions[0]?.version || null,
      versions: undefined,
    }));

    return { plugins: data, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }

  async getAnalytics(slug: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const analytics = await prisma.pluginAnalytics.findMany({
      where: { plugin: { slug }, date: { gte: thirtyDaysAgo } },
      orderBy: { date: "asc" }
    });

    if (analytics.length === 0) {
      const exists = await prisma.plugin.count({ where: { slug } });
      if (!exists) throw new Error("Plugin not found");
    }

    return analytics;
  }

  async getDependencies(slug: string) {
    const latestVersion = await prisma.version.findFirst({
      where: { plugin: { slug }, isLatest: true },
      select: { id: true, version: true, dependencies: { select: { name: true, version: true } } }
    });

    if (!latestVersion) throw new Error("No version found");

    return { version: latestVersion.version, dependencies: latestVersion.dependencies };
  }

  async getTrending() {
    const plugins = await prisma.plugin.findMany({
      where: { status: "APPROVED" },
      orderBy: { downloads: "desc" },
      take: 12,
      include: {
        author: { select: { username: true, displayName: true, avatarUrl: true } },
        versions: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, select: { version: true }, take: 1 },
      },
    });

    return plugins.map((p: any) => ({ ...p, latestVersion: p.versions[0]?.version || null, versions: undefined }));
  }

  async getLatest() {
    const plugins = await prisma.plugin.findMany({
      where: { status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        author: { select: { username: true, displayName: true, avatarUrl: true } },
        versions: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, select: { version: true }, take: 1 },
      },
    });

    return plugins.map((p: any) => ({ ...p, latestVersion: p.versions[0]?.version || null, versions: undefined }));
  }

  async getBySlug(slug: string, user?: any) {
    const plugin = await prisma.plugin.findUnique({
      where: { slug },
      include: {
        author: { select: { username: true, displayName: true, avatarUrl: true, bio: true } },
        versions: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true, version: true, changelog: true, longDescription: true, fileName: true, fileSize: true,
            downloads: true, isLatest: true, status: true, createdAt: true, supportedApis: true,
            producers: { select: { githubUser: true, role: true } }
          },
        },
        ratings: { select: { score: true } },
      },
    });

    if (!plugin) throw new Error("Plugin not found");

    const isAuthor = user?.id === plugin.authorId;
    const isAdmin = user?.trustLevel === "ADMIN";

    if (!isAuthor && !isAdmin && plugin.status !== "APPROVED" && plugin.status !== "PENDING_REVIEW") {
      throw new Error("Plugin not found");
    }

    const visibleVersions = (isAuthor || isAdmin) ? plugin.versions : plugin.versions.filter((v: any) => v.status === "APPROVED");
    const totalRatings = plugin.ratings.length;
    const averageRating = totalRatings > 0 ? plugin.ratings.reduce((sum: number, r: any) => sum + r.score, 0) / totalRatings : 0;
    const latestApprovedVersion = visibleVersions.find((v: any) => v.isLatest)?.version || visibleVersions[0]?.version || null;

    return {
      ...plugin,
      versions: visibleVersions,
      ratings: undefined,
      averageRating: Math.round(averageRating * 10) / 10,
      totalRatings,
      latestVersion: latestApprovedVersion,
    };
  }

  async createPlugin(data: any, userId: string) {
    const { name, displayName, description, longDescription, pluginType, repoUrl, license, tags } = data;

    if (!name || !displayName || !description) throw new Error("name, displayName, and description are required");

    const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    const existing = await prisma.plugin.findFirst({ where: { OR: [{ name }, { slug }] } });

    if (existing) throw new Error("A plugin with this name already exists");

    return await prisma.plugin.create({
      data: {
        name, slug, displayName, description, longDescription: longDescription || null,
        pluginType: pluginType || "PYTHON", repoUrl: repoUrl || null, license: license || null,
        tags: tags || [], authorId: userId, status: "DRAFT",
      },
      include: { author: { select: { username: true, displayName: true, avatarUrl: true } } },
    });
  }

  async updatePlugin(slug: string, data: any, user: any) {
    const plugin = await prisma.plugin.findUnique({ where: { slug } });

    if (!plugin) throw new Error("Plugin not found");
    if (plugin.authorId !== user.id && user.trustLevel !== "ADMIN") throw new Error("Not authorized");

    // repoUrl cannot be changed after creation
    const { displayName, description, longDescription, iconUrl, license, tags } = data;

    // Check displayName uniqueness if changing
    if (displayName && displayName !== plugin.displayName) {
      const existing = await prisma.plugin.findFirst({
        where: { displayName, id: { not: plugin.id } }
      });
      if (existing) throw new Error("A plugin with this display name already exists");
    }

    return await prisma.plugin.update({
      where: { slug },
      data: {
        ...(displayName && { displayName }),
        ...(description && { description }),
        ...(longDescription !== undefined && { longDescription }), ...(iconUrl !== undefined && { iconUrl }),
        ...(license !== undefined && { license }),
        ...(tags && { tags }),
      },
      include: { author: { select: { username: true, displayName: true, avatarUrl: true } } },
    });
  }

  async deletePlugin(slug: string, user: any) {
    const plugin = await prisma.plugin.findUnique({ where: { slug } });

    if (!plugin) throw new Error("Plugin not found");
    if (plugin.authorId !== user.id && user.trustLevel !== "ADMIN") throw new Error("Not authorized");

    await prisma.plugin.delete({ where: { slug } });
  }

  async triggerBuild(slug: string, data: any, user: any) {
    const plugin = await prisma.plugin.findUnique({ where: { slug } });

    if (!plugin) throw new Error("Plugin not found");
    if (plugin.authorId !== user.id && user.trustLevel !== "ADMIN") throw new Error("Not authorized");
    if (!plugin.repoUrl) throw new Error("Repository URL is required to trigger a build");

    const { commitHash, branch } = data;

    const job = await buildQueue.add("build-plugin", {
      pluginId: plugin.id,
      pluginSlug: plugin.slug,
      repoUrl: plugin.repoUrl,
      userId: user.id,
      commitHash: commitHash || null,
      branch: branch || "main",
    });

    return job.id;
  }
}

export const pluginsService = new PluginsService();
