// Download Routes
import { Router, Request, Response } from "express";
import { prisma } from "@endgit/database";
import { createStorage } from "@endgit/storage";
import path from "path";

const storage = createStorage();
export const downloadRouter: Router = Router();

/**
 * GET /api/v1/download/file/:key — Download any file from storage by key
 */
downloadRouter.get("/file/:key(*)", async (req: Request, res: Response) => {
  try {
    const key = String(req.params.key);
    const exists = await storage.exists(key);
    
    if (!exists) {
      return res.status(404).json({ success: false, error: "File not found" });
    }

    const file = await storage.download(key);
    const fileName = path.basename(key);

    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", file.length.toString());
    res.send(file);
  } catch (error: any) {
    console.error("Download file error:", error);
    res.status(500).json({ success: false, error: "Download failed" });
  }
});

/**
 * GET /api/v1/download/:slug/:version — Download a published release version
 */
downloadRouter.get("/:slug/:version", async (req: Request, res: Response) => {
  try {
    const plugin = await prisma.plugin.findUnique({
      where: { slug: String(req.params.slug) },
    });
    if (!plugin) return res.status(404).json({ success: false, error: "Plugin not found" });

    const version = await prisma.version.findUnique({
      where: { pluginId_version: { pluginId: plugin.id, version: String(req.params.version) } },
    });
    if (!version) return res.status(404).json({ success: false, error: "Version not found" });

    // Extract the actual storage key from fileUrl
    // fileUrl may be stored as "/api/v1/download/file/encodedKey", a raw key, or a JSON string for CPP plugins
    let storageKey = version.fileUrl;
    const platform = req.query.platform as string;
    
    try {
      if (storageKey.startsWith("{")) {
        const parsed = JSON.parse(storageKey);
        if (platform === "windows") {
          storageKey = parsed.win;
        } else if (platform === "linux") {
          storageKey = parsed.linux;
        } else {
          return res.status(400).json({ success: false, error: "Platform ?platform=linux or ?platform=windows is required for C++ plugins" });
        }
      }
    } catch(e) {
      // Ignore JSON parse errors, treat as regular string
    }

    const downloadPrefix = "/api/v1/download/file/";
    if (storageKey && storageKey.startsWith(downloadPrefix)) {
      storageKey = decodeURIComponent(storageKey.slice(downloadPrefix.length));
    }

    if (!storageKey) {
      return res.status(404).json({ success: false, error: "Artifact not found for this platform" });
    }

    const file = await storage.download(storageKey);

    // Get start of today (UTC)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Increment download counters and log analytics
    await Promise.all([
      prisma.version.update({ where: { id: version.id }, data: { downloads: { increment: 1 } } }),
      prisma.plugin.update({ where: { id: plugin.id }, data: { downloads: { increment: 1 } } }),
      prisma.pluginAnalytics.upsert({
        where: { pluginId_date: { pluginId: plugin.id, date: today } },
        update: { downloads: { increment: 1 } },
        create: { pluginId: plugin.id, date: today, downloads: 1 }
      })
    ]);

    let finalFileName = decodeURIComponent(path.basename(version.fileName));
    
    // Fix for legacy versions that were saved with "plugin-" prefix
    if (finalFileName.startsWith("plugin-")) {
      finalFileName = finalFileName.replace("plugin-", `${plugin.slug}-`);
    }

    if (plugin.pluginType === "CPP" && platform) {
      if (platform === "windows" && !finalFileName.endsWith(".dll")) {
        finalFileName += ".dll";
      } else if (platform === "linux" && !finalFileName.endsWith(".so")) {
        finalFileName += ".so";
      }
    }

    res.setHeader("Content-Disposition", `attachment; filename="${finalFileName}"`);
    res.setHeader("Content-Length", file.length.toString());
    res.setHeader("X-File-Hash", version.fileHash);
    res.send(file);
  } catch (error: any) {
    console.error("Download error:", error);
    res.status(500).json({ success: false, error: "Download failed" });
  }
});
