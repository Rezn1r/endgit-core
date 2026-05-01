// ─────────────────────────────────────────────────────────
// Plugin Routes — CRUD + Search + Listing
// ─────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { prisma } from "@endgit/database";
import { requireAuth, optionalAuth, AuthRequest } from "../middleware/auth";
import { buildRateLimit } from "../middleware/rateLimit";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import multer from "multer";
import { createStorage } from "@endgit/storage";

const storage = createStorage();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const buildQueue = new Queue("build-jobs", { connection });

export const pluginRouter: Router = Router();

// ── Public Endpoints ─────────────────────────────────────

/**
 * GET /api/v1/plugins — List plugins (paginated, filterable)
 */
pluginRouter.get("/", optionalAuth, async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(((req.query.page as any as string))) || 1);
    const pageSize = Math.min(
      50,
      Math.max(1, parseInt(((req.query.pageSize as any as string))) || 20)
    );
    const sort = (((req.query.sort as any as string))) || "downloads";
    const order = (((req.query.order as any as string))) || "desc";
    const tag = ((req.query.tag as any as string));
    const type = ((req.query.type as any as string));
    const search = ((req.query.q as any as string));

    const category = ((req.query.category as any as string));

    const where: any = {
      status: "APPROVED",
    };

    if (tag) {
      where.tags = { has: tag };
    }
    
    if (category) {
      where.tags = { has: category }; // Treat category as a tag
    }

    if (type && ["PYTHON", "CPP", "BOTH"].includes(type)) {
      where.pluginType = type;
    }

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
    else if (sort === "trending") orderBy.downloads = "desc"; // MVP: trending is downloads
    else orderBy.downloads = "desc";

    const [plugins, total] = await Promise.all([
      prisma.plugin.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          author: {
            select: {
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          versions: {
            where: { status: "APPROVED" },
            orderBy: { createdAt: "desc" },
            select: { version: true },
            take: 1,
          },
        },
      }),
      prisma.plugin.count({ where }),
    ]);

    const data = plugins.map((p: any) => ({
      ...p,
      latestVersion: p.versions[0]?.version || null,
      versions: undefined,
    }));

    res.json({
      success: true,
      data: { plugins: data },
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error: any) {
    console.error("List plugins error:", error);
    res.status(500).json({ success: false, error: "Failed to list plugins" });
  }
});

/**
 * GET /api/v1/plugins/:slug/analytics — Get 30-day download history
 */
pluginRouter.get("/:slug/analytics", async (req: Request, res: Response) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const analytics = await prisma.pluginAnalytics.findMany({
      where: { 
        plugin: { slug: String(req.params.slug) },
        date: { gte: thirtyDaysAgo }
      },
      orderBy: { date: "asc" }
    });

    if (analytics.length === 0) {
      // Check if plugin actually exists
      const exists = await prisma.plugin.count({ where: { slug: String(req.params.slug) } });
      if (!exists) {
        return res.status(404).json({ success: false, error: "Plugin not found" });
      }
    }

    res.json({ success: true, data: analytics });
  } catch (error: any) {
    console.error("Plugin analytics error:", error);
    res.status(500).json({ success: false, error: "Failed to get analytics" });
  }
});

/**
 * GET /api/v1/plugins/:slug/dependencies — Get dependency tree for latest version
 */
pluginRouter.get("/:slug/dependencies", async (req: Request, res: Response) => {
  try {
    const latestVersion = await prisma.version.findFirst({
      where: { plugin: { slug: String(req.params.slug) }, isLatest: true },
      select: {
        id: true,
        version: true,
        dependencies: {
          select: { name: true, version: true }
        }
      }
    });

    if (!latestVersion) {
      return res.status(404).json({ success: false, error: "No version found" });
    }

    res.json({
      success: true,
      data: {
        version: latestVersion.version,
        dependencies: latestVersion.dependencies
      }
    });
  } catch (error: any) {
    console.error("Plugin dependencies error:", error);
    res.status(500).json({ success: false, error: "Failed to get dependencies" });
  }
});

/**
 * GET /api/v1/plugins/trending — Trending plugins
 */
pluginRouter.get("/trending", async (_req: Request, res: Response) => {
  try {
    const plugins = await prisma.plugin.findMany({
      where: { status: "APPROVED" },
      orderBy: { downloads: "desc" },
      take: 12,
      include: {
        author: {
          select: { username: true, displayName: true, avatarUrl: true },
        },
        versions: {
          where: { status: "APPROVED" },
          orderBy: { createdAt: "desc" },
          select: { version: true },
          take: 1,
        },
      },
    });

    const data = plugins.map((p: any) => ({
      ...p,
      latestVersion: p.versions[0]?.version || null,
      versions: undefined,
    }));

    res.json({ success: true, data });
  } catch (error: any) {
    res
      .status(500)
      .json({ success: false, error: "Failed to get trending plugins" });
  }
});

/**
 * GET /api/v1/plugins/latest — Latest plugins
 */
pluginRouter.get("/latest", async (_req: Request, res: Response) => {
  try {
    const plugins = await prisma.plugin.findMany({
      where: { status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        author: {
          select: { username: true, displayName: true, avatarUrl: true },
        },
        versions: {
          where: { status: "APPROVED" },
          orderBy: { createdAt: "desc" },
          select: { version: true },
          take: 1,
        },
      },
    });

    const data = plugins.map((p: any) => ({
      ...p,
      latestVersion: p.versions[0]?.version || null,
      versions: undefined,
    }));

    res.json({ success: true, data });
  } catch (error: any) {
    res
      .status(500)
      .json({ success: false, error: "Failed to get latest plugins" });
  }
});

/**
 * GET /api/v1/plugins/:slug — Get plugin detail
 */
pluginRouter.get("/:slug", optionalAuth, async (req: Request, res: Response) => {
  try {
    const plugin = await prisma.plugin.findUnique({
      where: { slug: String(req.params.slug) },
      include: {
        author: {
          select: {
            username: true,
            displayName: true,
            avatarUrl: true,
            bio: true,
          },
        },
        versions: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            version: true,
            changelog: true,
            longDescription: true,
            fileName: true,
            fileSize: true,
            downloads: true,
            isLatest: true,
            status: true,
            createdAt: true,
            supportedApis: true,
            producers: {
              select: { githubUser: true, role: true }
            }
          },
        },
        ratings: {
          select: { score: true },
        },
      },
    });

    if (!plugin) {
      return res.status(404).json({ success: false, error: "Plugin not found" });
    }

    const isAuthor = (req as AuthRequest).user?.id === plugin.authorId;
    const isAdmin = (req as AuthRequest).user?.trustLevel === "ADMIN";

    if (!isAuthor && !isAdmin && plugin.status !== "APPROVED" && plugin.status !== "PENDING_REVIEW") {
      return res.status(404).json({
        success: false,
        error: "Plugin not found",
      });
    }

    // Filter versions: non-authors/admins only see APPROVED versions
    const visibleVersions = (isAuthor || isAdmin)
      ? plugin.versions
      : plugin.versions.filter((v: any) => v.status === "APPROVED");

    const totalRatings = plugin.ratings.length;
    const averageRating =
      totalRatings > 0
        ? plugin.ratings.reduce((sum: number, r: any) => sum + r.score, 0) / totalRatings
        : 0;

    // For non-authors, latestVersion should be the latest APPROVED version
    const latestApprovedVersion = visibleVersions.find((v: any) => v.isLatest)?.version
      || visibleVersions[0]?.version
      || null;

    res.json({
      success: true,
      data: {
        ...plugin,
        versions: visibleVersions,
        ratings: undefined,
        averageRating: Math.round(averageRating * 10) / 10,
        totalRatings,
        latestVersion: latestApprovedVersion,
      },
    });
  } catch (error: any) {
    console.error("Get plugin error:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to get plugin details" });
  }
});

// ── Authenticated Endpoints ──────────────────────────────

/**
 * POST /api/v1/plugins — Create new plugin
 */
pluginRouter.post(
  "/",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const { name, displayName, description, longDescription, pluginType, repoUrl, license, tags } = req.body;

      if (!name || !displayName || !description) {
        return res.status(400).json({
          success: false,
          error: "name, displayName, and description are required",
        });
      }

      // Generate slug from name
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

      // Check uniqueness
      const existing = await prisma.plugin.findFirst({
        where: { OR: [{ name }, { slug }] },
      });

      if (existing) {
        return res.status(409).json({
          success: false,
          error: "A plugin with this name already exists",
        });
      }

      const plugin = await prisma.plugin.create({
        data: {
          name,
          slug,
          displayName,
          description,
          longDescription: longDescription || null,
          pluginType: pluginType || "PYTHON",
          repoUrl: repoUrl || null,
          license: license || null,
          tags: tags || [],
          authorId: req.user!.id,
          status: "DRAFT",
        },
        include: {
          author: {
            select: { username: true, displayName: true, avatarUrl: true },
          },
        },
      });

      res.status(201).json({ success: true, data: plugin });
    } catch (error: any) {
      console.error("Create plugin error:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to create plugin" });
    }
  }
);

/**
 * PATCH /api/v1/plugins/:slug — Update plugin metadata
 */
pluginRouter.patch(
  "/:slug",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const plugin = await prisma.plugin.findUnique({
        where: { slug: String(req.params.slug) },
      });

      if (!plugin) {
        return res.status(404).json({ success: false, error: "Plugin not found" });
      }

      if (plugin.authorId !== req.user!.id && req.user!.trustLevel !== "ADMIN") {
        return res.status(403).json({ success: false, error: "Not authorized" });
      }

      const { displayName, description, longDescription, iconUrl, repoUrl, license, tags } = req.body;

      const updated = await prisma.plugin.update({
        where: { slug: String(req.params.slug) },
        data: {
          ...(displayName && { displayName }),
          ...(description && { description }),
          ...(longDescription !== undefined && { longDescription }),
          ...(iconUrl !== undefined && { iconUrl }),
          ...(repoUrl !== undefined && { repoUrl }),
          ...(license !== undefined && { license }),
          ...(tags && { tags }),
        },
        include: {
          author: {
            select: { username: true, displayName: true, avatarUrl: true },
          },
        },
      });

      res.json({ success: true, data: updated });
    } catch (error: any) {
      console.error("Update plugin error:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to update plugin" });
    }
  }
);

/**
 * DELETE /api/v1/plugins/:slug — Delete plugin
 */
pluginRouter.delete(
  "/:slug",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const plugin = await prisma.plugin.findUnique({
        where: { slug: String(req.params.slug) },
      });

      if (!plugin) {
        return res.status(404).json({ success: false, error: "Plugin not found" });
      }

      if (plugin.authorId !== req.user!.id && req.user!.trustLevel !== "ADMIN") {
        return res.status(403).json({ success: false, error: "Not authorized" });
      }

      await prisma.plugin.delete({
        where: { slug: String(req.params.slug) },
      });

      res.json({ success: true, message: "Plugin deleted" });
    } catch (error: any) {
      console.error("Delete plugin error:", error);
      res
        .status(500)
        .json({ success: false, error: "Failed to delete plugin" });
    }
  }
);

/**
 * POST /api/v1/plugins/:slug/build — Trigger auto-build from GitHub
 */
pluginRouter.post(
  "/:slug/build",
  requireAuth,
  buildRateLimit,
  async (req: AuthRequest, res: Response) => {
    try {
      const plugin = await prisma.plugin.findUnique({
        where: { slug: String(req.params.slug) },
      });

      if (!plugin) {
        return res.status(404).json({ success: false, error: "Plugin not found" });
      }

      if (plugin.authorId !== req.user!.id && req.user!.trustLevel !== "ADMIN") {
        return res.status(403).json({ success: false, error: "Not authorized" });
      }

      if (!plugin.repoUrl) {
        return res.status(400).json({ success: false, error: "Repository URL is required to trigger a build" });
      }

      // Accept optional commitHash and branch from request body
      const { commitHash, branch } = req.body || {};

      // Enqueue job with commit info
      const job = await buildQueue.add("build-plugin", {
        pluginId: plugin.id,
        pluginSlug: plugin.slug,
        repoUrl: plugin.repoUrl,
        userId: req.user!.id,
        commitHash: commitHash || null,
        branch: branch || "main",
      });

      // Plugin status is no longer mutated here to preserve marketplace lifecycle

      res.status(202).json({ success: true, data: { jobId: job.id, message: "Build queued" } });
    } catch (error: any) {
      console.error("Build plugin error:", error);
      res.status(500).json({ success: false, error: "Failed to queue build" });
    }
  }
);

/**
 * POST /api/v1/plugins/:slug/publish — CLI publish source code zip
 */
pluginRouter.post(
  "/:slug/publish",
  requireAuth,
  buildRateLimit,
  upload.single("source"),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded" });
      }

      const plugin = await prisma.plugin.findUnique({
        where: { slug: String(req.params.slug) },
      });

      if (!plugin) {
        return res.status(404).json({ success: false, error: "Plugin not found" });
      }

      if (plugin.authorId !== req.user!.id && req.user!.trustLevel !== "ADMIN") {
        return res.status(403).json({ success: false, error: "Not authorized" });
      }

      // Save source ZIP via storage provider
      const timestamp = Date.now();
      const sourceKey = `sources/${plugin.slug}/${timestamp}.zip`;
      await storage.upload(sourceKey, req.file.buffer, "application/zip");

      // Extract metadata if available
      const commitHash = req.body.commitHash || null;
      const branch = req.body.branch || "main";

      // Enqueue job with sourceKey
      const job = await buildQueue.add("build-plugin", {
        pluginId: plugin.id,
        pluginSlug: plugin.slug,
        repoUrl: "", // Overridden by sourceKey
        sourceKey,
        userId: req.user!.id,
        commitHash,
        branch,
      });

      // Plugin status is no longer mutated here to preserve marketplace lifecycle

      res.status(202).json({ success: true, data: { jobId: job.id, message: "Publish build queued" } });
    } catch (error: any) {
      console.error("Publish plugin error:", error);
      res.status(500).json({ success: false, error: "Failed to queue publish build" });
    }
  }
);
