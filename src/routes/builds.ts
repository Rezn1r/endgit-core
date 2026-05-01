// ─────────────────────────────────────────────────────────
// Build Routes — Live Builds / Dev Builds
// ─────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { prisma } from "@endgit/database";
import { requireAuth, optionalAuth, AuthRequest } from "../middleware/auth";

export const buildRouter: Router = Router();

// ── Public Endpoints ─────────────────────────────────────

/**
 * GET /api/v1/builds/recent — Get recent builds (paginated)
 * Query: ?page=1&limit=20&status=SUCCESS&branch=main
 */
buildRouter.get("/recent", async (req: Request, res: Response) => {
  try {
    const page = parseInt(((req.query.page as any as string))) || 1;
    const limit = Math.min(parseInt(((req.query.limit as any as string))) || 20, 50);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.branch) where.branch = req.query.branch;

    const [builds, total] = await Promise.all([
      prisma.build.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        distinct: ['pluginId'],
        include: {
          plugin: {
            select: {
              name: true,
              displayName: true,
              slug: true,
              pluginType: true,
              iconUrl: true,
              author: {
                select: { username: true, avatarUrl: true }
              }
            }
          }
        }
      }),
      prisma.build.count({ where })
    ]);

    res.json({
      success: true,
      data: builds,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    console.error("Get recent builds error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch builds" });
  }
});

// Note: GET /plugin/:slug is defined below with full pagination support

/**
 * GET /api/v1/builds/me — Get my builds (authenticated)
 */
buildRouter.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(((req.query.page as any as string))) || 1;
    const limit = Math.min(parseInt(((req.query.limit as any as string))) || 20, 50);
    const skip = (page - 1) * limit;

    const builds = await prisma.build.findMany({
      where: {
        plugin: { authorId: req.user!.id }
      },
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        plugin: {
          select: {
            name: true,
            displayName: true,
            slug: true,
            pluginType: true
          }
        }
      }
    });

    res.json({ success: true, data: builds });
  } catch (error: any) {
    console.error("Get my builds error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch builds" });
  }
});

/**
 * GET /api/v1/builds/plugin/:slug — Get build history for a specific plugin
 */
buildRouter.get("/plugin/:slug", async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug);
    const page = parseInt(((req.query.page as any as string))) || 1;
    const limit = Math.min(parseInt(((req.query.limit as any as string))) || 20, 50);
    const skip = (page - 1) * limit;

    const buildWhere = { plugin: { slug } };

    // Parallel: fetch plugin info, builds, and count simultaneously
    const [plugin, builds, total] = await Promise.all([
      prisma.plugin.findUnique({
        where: { slug },
        select: { 
          id: true, name: true, displayName: true, status: true, reviewBuildId: true, pluginType: true,
          versions: {
            select: { status: true, fileHash: true, version: true, fileUrl: true }
          }
        }
      }),
      prisma.build.findMany({
        where: buildWhere,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          buildNumber: true,
          commitHash: true,
          commitMessage: true,
          branch: true,
          status: true,
          isRelease: true,
          artifactUrl: true,
          artifactUrlLinux: true,
          artifactUrlWin: true,
          duration: true,
          createdAt: true,
          finishedAt: true
        }
      }),
      prisma.build.count({ where: buildWhere })
    ]);

    if (!plugin) {
      return res.status(404).json({ success: false, error: "Plugin not found" });
    }

    // Attach version status to builds using fileUrl or commitHash
    const buildsWithVersion = builds.map((build: any) => {
      // Reconstruct the expected fileUrl for this build
      let expectedFileUrl = build.artifactUrl || "";
      if (plugin.pluginType === "CPP") {
        expectedFileUrl = JSON.stringify({ linux: build.artifactUrlLinux, win: build.artifactUrlWin });
      }

      // Find the version that was created from this build
      const version = plugin.versions.find((v: any) => {
        if (expectedFileUrl && v.fileUrl === expectedFileUrl) return true;
        if (build.commitHash && v.fileHash === build.commitHash) return true;
        return false;
      });
      
      return {
        ...build,
        versionStatus: version ? version.status : (build.isRelease ? "REJECTED" : null),
        versionString: version ? version.version : null
      };
    });

    res.json({
      success: true,
      data: { plugin, builds: buildsWithVersion },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error: any) {
    console.error("Get plugin builds error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch builds" });
  }
});

/**
 * GET /api/v1/builds/:id — Get build details including logs
 */
buildRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const build = await prisma.build.findUnique({
      where: { id: String(req.params.id) },
      include: {
        plugin: {
          select: {
            name: true,
            displayName: true,
            slug: true,
            pluginType: true,
            status: true,
            reviewBuildId: true,
            description: true,
            longDescription: true,
            tags: true,
            keywords: true,
            license: true,
            repoUrl: true,
            author: {
              select: { username: true, avatarUrl: true }
            },
            versions: {
              orderBy: { createdAt: "desc" as const },
              take: 1,
              select: { version: true, supportedApis: true }
            }
          }
        }
      }
    });

    if (!build) {
      return res.status(404).json({ success: false, error: "Build not found" });
    }

    res.json({ success: true, data: build });
  } catch (error: any) {
    console.error("Get build detail error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch build" });
  }
});

/**
 * GET /api/v1/builds/:id/stream — SSE real-time build log stream
 * Client connects and receives log updates every 2s until build finishes.
 */
buildRouter.get("/:id/stream", async (req: Request, res: Response) => {
  try {
    const buildId = String(req.params.id);
    
    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    let lastLogLength = 0;
    let finished = false;

    const sendUpdate = async () => {
      try {
        const build = await prisma.build.findUnique({
          where: { id: buildId },
          select: { logs: true, status: true, safeScore: true, duration: true, finishedAt: true }
        });

        if (!build) {
          res.write(`data: ${JSON.stringify({ type: "error", message: "Build not found" })}\n\n`);
          res.end();
          return;
        }

        const currentLog = build.logs || "";
        if (currentLog.length > lastLogLength) {
          const newContent = currentLog.slice(lastLogLength);
          lastLogLength = currentLog.length;
          res.write(`data: ${JSON.stringify({ type: "log", content: newContent })}\n\n`);
        }

        if (build.status === "SUCCESS" || build.status === "FAILED" || build.status === "CANCELLED") {
          res.write(`data: ${JSON.stringify({ 
            type: "finish", 
            status: build.status, 
            safeScore: build.safeScore,
            duration: build.duration 
          })}\n\n`);
          finished = true;
          res.end();
        }
      } catch (err: any) {
        res.write(`data: ${JSON.stringify({ type: "error", message: "Stream error" })}\n\n`);
        finished = true;
        res.end();
      }
    };

    // Poll every 2 seconds
    const interval = setInterval(async () => {
      if (finished) {
        clearInterval(interval);
        return;
      }
      await sendUpdate();
    }, 2000);

    // Send initial state immediately
    await sendUpdate();

    // Clean up on client disconnect
    req.on("close", () => {
      clearInterval(interval);
      finished = true;
    });

  } catch (error: any) {
    console.error("Build stream error:", error);
    res.status(500).json({ success: false, error: "Failed to start stream" });
  }
});
