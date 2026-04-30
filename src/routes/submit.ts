// ─────────────────────────────────────────────────────────
// Submit for Review Routes
// ─────────────────────────────────────────────────────────

import { Router, Response } from "express";
import { prisma } from "@endgit/database";
import { requireAuth, AuthRequest } from "../middleware/auth";

export const submitRouter: Router = Router();

/**
 * POST /api/v1/submit/:buildId — Submit a build for review
 */
submitRouter.post("/:buildId", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const build = await prisma.build.findUnique({
      where: { id: String(req.params.buildId) },
      include: { plugin: { select: { id: true, authorId: true, status: true, name: true } } }
    });

    if (!build) {
      return res.status(404).json({ success: false, error: "Build not found" });
    }

    if (build.plugin.authorId !== req.user!.id) {
      return res.status(403).json({ success: false, error: "You can only submit your own builds" });
    }

    if (build.status !== "SUCCESS") {
      return res.status(400).json({ success: false, error: "Only successful builds can be submitted for review" });
    }

    if (build.plugin.status === "PENDING_REVIEW") {
      return res.status(400).json({ success: false, error: "A version is currently pending review. Please wait for it to be approved or rejected." });
    }

    const latestRelease = await prisma.build.findFirst({
      where: { pluginId: build.pluginId, isRelease: true },
      orderBy: { buildNumber: "desc" }
    });

    if (latestRelease && build.buildNumber <= latestRelease.buildNumber) {
      return res.status(400).json({ success: false, error: `You cannot submit a build older than or equal to the latest submitted build (#${latestRelease.buildNumber}).` });
    }

    const { version, displayName, description, longDescription, tags, license, iconPath, producers, changelog, supportedApis } = req.body;

    if (!version || !displayName) {
      return res.status(400).json({ success: false, error: "Version and Display Name are required" });
    }

    // 1. Check if version already exists
    const existingVersion = await prisma.version.findFirst({
      where: { pluginId: build.plugin.id, version }
    });
    if (existingVersion) {
      return res.status(400).json({ success: false, error: `Version ${version} already exists for this plugin.` });
    }

    // 2. Validate Producers and GitHub Usernames
    if (!producers || !Array.isArray(producers) || producers.length === 0) {
      return res.status(400).json({ success: false, error: "At least one producer is required" });
    }
    
    const uniqueUsernames = new Set(producers.map(p => p.githubUser.trim().toLowerCase()));
    if (uniqueUsernames.size !== producers.length) {
      return res.status(400).json({ success: false, error: "Duplicate producer usernames are not allowed" });
    }

    // Verify each username with GitHub API
    for (const p of producers) {
      const username = p.githubUser.trim();
      if (!username) continue;
      try {
        const ghRes = await fetch(`https://api.github.com/users/${username}`);
        if (!ghRes.ok) {
          if (ghRes.status === 404) {
            return res.status(400).json({ success: false, error: `GitHub user '${username}' does not exist.` });
          }
        }
      } catch (err) {
        // Ignore network errors so we don't block submission if GitHub is down
        console.warn(`Could not verify GitHub user ${username}:`, err);
      }
    }

    // Process tags (comma separated)
    let processedTags: string[] = [];
    if (tags && typeof tags === "string") {
      processedTags = tags.split(",").map(t => t.trim()).filter(Boolean);
    }

    // Process Icon URL
    let iconUrl = build.plugin.iconUrl;
    if (build.plugin.repoUrl) {
      const repoPath = build.plugin.repoUrl.replace("https://github.com/", "").replace(/\/$/, "");
      const commit = build.commitHash || "main";
      const path = iconPath ? iconPath.replace(/^\//, "") : "icon.png";
      iconUrl = `https://raw.githubusercontent.com/${repoPath}/${commit}/${path}`;
    }

    // Transaction to update Plugin and Create Version with Producers
    await prisma.$transaction(async (tx) => {
      const existingPlugin = await tx.plugin.findUnique({ where: { id: build.plugin.id } });
      const newStatus = existingPlugin?.status === "APPROVED" ? "APPROVED" : "PENDING_REVIEW";

      // Update plugin metadata and status
      await tx.plugin.update({
        where: { id: build.plugin.id },
        data: {
          status: newStatus,
          reviewBuildId: build.id,
          displayName,
          description: description || build.plugin.name,
          longDescription: longDescription || "",
          tags: processedTags,
          license: license || "",
          iconUrl,
        }
      });

      // Determine file URL based on plugin type
      let versionFileUrl = build.artifactUrl || "";
      let versionFileName = build.artifactUrl ? build.artifactUrl.split('/').pop()! : `build-${build.buildNumber}.zip`;
      let versionFileSize = build.artifactSize || 0;

      // For CPP plugins, serialize both platform artifacts
      const pluginFull = await tx.plugin.findUnique({ where: { id: build.plugin.id }, select: { pluginType: true } });
      if (pluginFull?.pluginType === "CPP") {
        versionFileUrl = JSON.stringify({ linux: build.artifactUrlLinux, win: build.artifactUrlWin });
        versionFileName = `plugin-${version}-cpp`;
        versionFileSize = (build.artifactSizeLinux || 0) + (build.artifactSizeWin || 0);
      }

      // Create Version with Producers
      await tx.version.create({
        data: {
          pluginId: build.plugin.id,
          version,
          fileUrl: versionFileUrl,
          fileName: versionFileName,
          fileSize: versionFileSize,
          fileHash: build.commitHash || "",
          status: "PENDING",
          changelog: changelog || req.body.notes || "",
          longDescription: longDescription || "",
          supportedApis: Array.isArray(supportedApis) ? supportedApis : [],
          isLatest: true,
          producers: {
            create: producers.map((p: any) => ({
              githubUser: p.githubUser.trim(),
              role: p.role
            }))
          }
        }
      });

      // Mark build as release
      await tx.build.update({
        where: { id: build.id },
        data: { isRelease: true }
      });
    });

    res.json({
      success: true,
      message: `Build #${build.buildNumber} submitted for review`,
      data: { pluginId: build.plugin.id, buildId: build.id }
    });
  } catch (error: any) {
    console.error("Submit for review error:", error);
    res.status(500).json({ success: false, error: "Failed to submit for review" });
  }
});

/**
 * GET /api/v1/submit/status/:pluginSlug — Check review status
 */
submitRouter.get("/status/:pluginSlug", async (req, res: Response) => {
  try {
    const plugin = await prisma.plugin.findUnique({
      where: { slug: String(req.params.pluginSlug) },
      select: {
        id: true, status: true, reviewBuildId: true,
        reviews: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { decision: true, comment: true, createdAt: true, reviewer: { select: { username: true } } }
        }
      }
    });

    if (!plugin) {
      return res.status(404).json({ success: false, error: "Plugin not found" });
    }

    res.json({
      success: true,
      data: {
        status: plugin.status,
        reviewBuildId: plugin.reviewBuildId,
        latestReview: plugin.reviews[0] || null
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to fetch review status" });
  }
});
