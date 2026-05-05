// ─────────────────────────────────────────────────────────
// Build Callback Routes
// Receives artifacts from GitHub Actions after C++ builds
// ─────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { prisma } from "@endgit/database";
import { createStorage } from "@endgit/storage";
import multer from "multer";

const storage = createStorage();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB max

export const callbackRouter: Router = Router();

const CALLBACK_TOKEN = process.env.ENDGIT_CALLBACK_TOKEN || "endgit-callback-secret";

/**
 * POST /api/v1/builds/:id/artifact-callback
 * Called by GitHub Actions to upload compiled artifacts (Windows .dll, Linux .so)
 * 
 * Supports two content types:
 * 1. multipart/form-data — with file upload (on success)
 * 2. application/json — status-only update (on failure)
 */
callbackRouter.post("/:id/artifact-callback", upload.single("artifact"), async (req: Request, res: Response) => {
  try {
    // Verify callback token
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token !== CALLBACK_TOKEN) {
      return res.status(401).json({ success: false, error: "Unauthorized callback" });
    }

    const buildId = String(req.params.id);
    const build = await prisma.build.findUnique({
      where: { id: buildId },
      include: { plugin: { select: { slug: true, displayName: true, pluginType: true } } }
    });

    if (!build) {
      return res.status(404).json({ success: false, error: "Build not found" });
    }

    const platform = (req.body.platform as string) || "unknown";
    const status = (req.body.status as string) || "FAILED";
    const error = req.body.error as string | undefined;

    console.log(`[Callback] Build ${buildId} — Platform: ${platform}, Status: ${status}`);

    // ── Handle failure ────────────────────────────────────
    if (status === "FAILED") {
      const updateData: any = {};
      const logMsg = `\n❌ ${platform === "windows" ? "🪟 Windows" : "🐧 Linux"} build failed${error ? `: ${error}` : ""}\n`;

      if (platform === "windows") {
        updateData.winBuildStatus = "FAILED";
      } else if (platform === "linux") {
        updateData.linuxBuildStatus = "FAILED";
      } else {
        // "all" — both failed
        updateData.winBuildStatus = "FAILED";
        updateData.linuxBuildStatus = "FAILED";
      }

      await prisma.build.update({ where: { id: buildId }, data: updateData });
      await appendLog(buildId, logMsg);

      // Check if both platforms are resolved → finalize build
      await checkAndFinalizeBuild(buildId);

      return res.json({ success: true, message: "Failure recorded" });
    }

    // ── Handle success with artifact upload ───────────────
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No artifact file provided" });
    }

    const pluginSlug = build.plugin.slug;
    const ext = platform === "windows" ? "dll" : "so";
    const artifactKey = `artifacts/${pluginSlug}/${build.buildNumber}/endstone_${pluginSlug}.${ext}`;

    // Upload to S3/local storage
    await storage.upload(artifactKey, req.file.buffer, "application/octet-stream");
    const artifactUrl = `/api/v1/download/file/${encodeURIComponent(artifactKey)}`;
    const artifactSize = req.file.size;

    console.log(`[Callback] Stored ${platform} artifact: ${artifactKey} (${artifactSize} bytes)`);

    // Update DB with platform-specific artifact
    const updateData: any = {};
    if (platform === "windows") {
      updateData.artifactUrlWin = artifactUrl;
      updateData.artifactSizeWin = artifactSize;
      updateData.winBuildStatus = "SUCCESS";
    } else {
      updateData.artifactUrlLinux = artifactUrl;
      updateData.artifactSizeLinux = artifactSize;
      updateData.linuxBuildStatus = "SUCCESS";
    }

    await prisma.build.update({ where: { id: buildId }, data: updateData });

    const emoji = platform === "windows" ? "🪟" : "🐧";
    await appendLog(buildId, `\n✅ ${emoji} ${platform.charAt(0).toUpperCase() + platform.slice(1)} build completed — ${artifactKey} (${formatBytes(artifactSize)})\n`);

    // Check if both platforms are resolved → finalize build
    await checkAndFinalizeBuild(buildId);

    res.json({ success: true, message: `${platform} artifact uploaded` });
  } catch (error: any) {
    console.error("[Callback] Error:", error);
    res.status(500).json({ success: false, error: "Callback processing failed" });
  }
});

/**
 * Check if both platform builds are resolved and finalize the build if so.
 * Sets overall status to SUCCESS if at least one platform succeeded.
 */
async function checkAndFinalizeBuild(buildId: string) {
  const build = await prisma.build.findUnique({
    where: { id: buildId },
    select: {
      winBuildStatus: true,
      linuxBuildStatus: true,
      status: true,
      buildNumber: true,
      safeScore: true,
      createdAt: true,
      pluginId: true,
      commitHash: true,
      commitMessage: true,
      branch: true,
      artifactUrlLinux: true,
      artifactUrlWin: true,
      plugin: { select: { displayName: true, slug: true, repoUrl: true, author: { select: { displayName: true, username: true, avatarUrl: true } } } }
    }
  });

  if (!build) return;

  const winDone = build.winBuildStatus === "SUCCESS" || build.winBuildStatus === "FAILED";
  const linuxDone = build.linuxBuildStatus === "SUCCESS" || build.linuxBuildStatus === "FAILED";

  if (!winDone || !linuxDone) {
    // Still waiting for one platform
    return;
  }

  // Both platforms resolved
  const winOk = build.winBuildStatus === "SUCCESS";
  const linuxOk = build.linuxBuildStatus === "SUCCESS";
  const anySuccess = winOk || linuxOk;

  const duration = Math.round((Date.now() - build.createdAt.getTime()) / 1000);
  const finalStatus = anySuccess ? "SUCCESS" : "FAILED";

  let summary = `\n${"═".repeat(50)}\n`;
  summary += `📋 Build #${build.buildNumber} — Final Results\n`;
  summary += `${"─".repeat(50)}\n`;
  summary += `🐧 Linux:   ${linuxOk ? "✅ SUCCESS" : "❌ FAILED"}\n`;
  summary += `🪟 Windows: ${winOk ? "✅ SUCCESS" : "❌ FAILED"}\n`;
  summary += `🛡️ Safe Score: ${build.safeScore || 0}/100\n`;
  summary += `⏱️ Total time: ${duration}s\n`;
  summary += `${"═".repeat(50)}\n`;

  await appendLog(buildId, summary);

  await prisma.build.update({
    where: { id: buildId },
    data: {
      status: finalStatus,
      duration,
      finishedAt: new Date(),
    }
  });

  // Update plugin trust score
  if (build.safeScore !== null) {
    const recentBuilds = await prisma.build.findMany({
      where: { pluginId: build.pluginId, safeScore: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { safeScore: true }
    });

    if (recentBuilds.length > 0) {
      const avgScore = Math.round(
        recentBuilds.reduce((sum, b) => sum + (b.safeScore || 0), 0) / recentBuilds.length
      );
      await prisma.plugin.update({
        where: { id: build.pluginId },
        data: { trustScore: avgScore }
      });
    }
  }

  // Discord notification
  try {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL || "https://discord.com/api/webhooks/[REDACTED_WEBHOOK_URL]";
    if (webhookUrl) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://endgit.dev";
      const buildLogLink = `${baseUrl}/builds/${buildId}`;

      const linuxLink = build.artifactUrlLinux ? `[🐧 Download .so](${baseUrl}${build.artifactUrlLinux})` : "❌ Failed";
      const winLink = build.artifactUrlWin ? `[🪟 Download .dll](${baseUrl}${build.artifactUrlWin})` : "❌ Failed";

      const embed = {
        title: `Plugin ${build.plugin.displayName || build.plugin.slug}, Build #${build.buildNumber}`,
        url: buildLogLink,
        color: anySuccess ? 8359053 : 15548997, // Purple for success, Red for failure
        author: {
          name: build.plugin.author?.displayName || build.plugin.author?.username || "EndGit Author",
          icon_url: build.plugin.author?.avatarUrl || undefined,
        },
        description: `In branch **${build.branch || "main"}**:\n[${build.commitHash?.slice(0, 7) || "HEAD"}](${build.plugin.repoUrl}/commit/${build.commitHash})\n\n${build.commitMessage ? `> ${build.commitMessage}` : ""}`,
        fields: [
          { name: "🐧 Linux Build", value: linuxLink, inline: true },
          { name: "🪟 Windows Build", value: winLink, inline: true },
          { name: "🛡️ Security", value: `Safe Score: **${build.safeScore || 0}/100**\n${(build.safeScore || 0) >= 80 ? "✅ Passed" : "⚠️ Warning"}`, inline: false },
        ],
        footer: { text: "⚠️ This is a development build. Don't download it unless you are sure this plugin works!" },
        timestamp: new Date().toISOString()
      };

      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "EndGit-CI",
          avatar_url: "https://github.com/fluidicon.png",
          content: anySuccess ? "A new cross-platform C++ build has been completed!" : "❌ A cross-platform C++ build has failed!",
          embeds: [embed]
        })
      });
      console.log(`[Callback] Discord notification sent for build #${build.buildNumber}`);
    }
  } catch (e: any) {
    console.warn(`[Callback] Discord notification failed: ${e.message}`);
  }
}

async function appendLog(buildId: string, message: string) {
  await prisma.$executeRaw`UPDATE "builds" SET logs = CONCAT(COALESCE(logs, ''), ${message}::text) WHERE id = ${buildId}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
