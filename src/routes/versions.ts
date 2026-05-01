// ─────────────────────────────────────────────────────────
// Plugin Versions Routes
// ─────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { prisma } from "@endgit/database";
import { requireAuth, AuthRequest } from "../middleware/auth";

export const versionsRouter: Router = Router();

/**
 * GET /api/v1/versions/:slug — List all versions for a plugin
 */
versionsRouter.get("/:slug", async (req: Request, res: Response) => {
  try {
    const plugin = await prisma.plugin.findUnique({
      where: { slug: String(req.params.slug) },
    });

    if (!plugin) {
      return res.status(404).json({ success: false, error: "Plugin not found" });
    }

    const versions = await prisma.version.findMany({
      where: { pluginId: plugin.id },
      orderBy: { createdAt: "desc" },
    });

    res.json({ success: true, data: versions });
  } catch (error: any) {
    console.error("List versions error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch versions" });
  }
});

/**
 * POST /api/v1/versions/:slug — Add a new version (Manual Submission or from Build)
 */
versionsRouter.post("/:slug", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { version, changelog, buildId, fileUrl, fileName, fileSize, fileHash } = req.body;

    const plugin = await prisma.plugin.findUnique({
      where: { slug: String(req.params.slug) },
    });

    if (!plugin) {
      return res.status(404).json({ success: false, error: "Plugin not found" });
    }

    if (plugin.authorId !== req.user!.id && req.user!.trustLevel !== "ADMIN") {
      return res.status(403).json({ success: false, error: "Not authorized" });
    }

    let actualFileUrl = fileUrl;
    let actualFileName = fileName;
    let actualFileSize = fileSize;
    let actualFileHash = fileHash;

    // If submitted from a build, pull details from the build
    if (buildId) {
      const build = await prisma.build.findUnique({ where: { id: buildId } });
      if (!build || build.pluginId !== plugin.id || build.status !== "SUCCESS") {
        return res.status(400).json({ success: false, error: "Invalid or unsuccessful build ID" });
      }

      if (plugin.pluginType === "CPP") {
        actualFileUrl = JSON.stringify({ linux: build.artifactUrlLinux, win: build.artifactUrlWin });
        actualFileName = `${plugin.slug}-${version}`;
        actualFileSize = (build.artifactSizeLinux || 0) + (build.artifactSizeWin || 0);
      } else {
        actualFileUrl = build.artifactUrl;
        actualFileName = `${plugin.slug}-${version}.zip`; // Placeholder name from build
        actualFileSize = build.artifactSize || 0;
      }
      actualFileHash = "sha256-from-build"; // In a real system, calculate or store this in build
    }

    if (!actualFileUrl || (!actualFileName && plugin.pluginType !== "CPP")) {
      return res.status(400).json({ success: false, error: "File URL and Name are required" });
    }

    // Set all other versions to not latest
    await prisma.version.updateMany({
      where: { pluginId: plugin.id },
      data: { isLatest: false },
    });

    // Create the new version
    const newVersion = await prisma.version.create({
      data: {
        version,
        changelog,
        fileUrl: actualFileUrl,
        fileName: actualFileName,
        fileSize: actualFileSize || 0,
        fileHash: actualFileHash || "",
        isLatest: true,
        status: "PENDING",
        pluginId: plugin.id,
      },
    });

    // Mark build as release if applicable
    if (buildId) {
      await prisma.build.update({
        where: { id: buildId },
        data: { isRelease: true },
      });
    }

    // Also update plugin status if it was DRAFT
    if (plugin.status === "DRAFT") {
      await prisma.plugin.update({
        where: { id: plugin.id },
        data: { status: "PENDING_REVIEW" },
      });
    }

    res.status(201).json({ success: true, data: newVersion });
  } catch (error: any) {
    console.error("Create version error:", error);
    if (error.code === 'P2002') {
       return res.status(409).json({ success: false, error: "Version already exists" });
    }
    res.status(500).json({ success: false, error: "Failed to create version" });
  }
});

/**
 * DELETE /api/v1/versions/:slug/:version — Delete a specific version
 */
versionsRouter.delete("/:slug/:version", requireAuth, async (req: AuthRequest, res: Response) => {
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

    const version = await prisma.version.findFirst({
      where: { pluginId: plugin.id, version: String(req.params.version) },
    });

    if (!version) {
      return res.status(404).json({ success: false, error: "Version not found" });
    }

    await prisma.version.delete({
      where: { id: version.id },
    });

    // If it was latest, make the next most recent one latest
    if (version.isLatest) {
      const nextLatest = await prisma.version.findFirst({
        where: { pluginId: plugin.id },
        orderBy: { createdAt: "desc" },
      });
      if (nextLatest) {
         await prisma.version.update({
           where: { id: nextLatest.id },
           data: { isLatest: true },
         });
      }
    }

    res.json({ success: true, message: "Version deleted" });
  } catch (error: any) {
    console.error("Delete version error:", error);
    res.status(500).json({ success: false, error: "Failed to delete version" });
  }
});
