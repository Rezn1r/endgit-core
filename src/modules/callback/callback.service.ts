import { prisma } from "@endgit/database";
import { createStorage } from "@endgit/storage";
import fs from "fs";

const storage = createStorage();

export class CallbackService {
  async processCallback(buildId: string, platform: string, status: string, error?: string, file?: any) {
    if (platform !== "windows" && platform !== "linux") {
      throw new Error("Invalid callback platform");
    }

    if (status !== "SUCCESS" && status !== "FAILED") {
      throw new Error("Invalid callback status");
    }

    const build = await prisma.build.findUnique({
      where: { id: buildId },
      include: { plugin: { select: { slug: true, displayName: true, pluginType: true } } }
    });

    if (!build) throw new Error("Build not found");

    console.log(`[Callback] Build ${buildId} — Platform: ${platform}, Status: ${status}`);

    if (status === "FAILED") {
      const updateData: any = {};
      const logMsg = `\n❌ ${platform === "windows" ? "🪟 Windows" : "🐧 Linux"} build failed${error ? `: ${error}` : ""}\n`;

      if (platform === "windows") updateData.winBuildStatus = "FAILED";
      else if (platform === "linux") updateData.linuxBuildStatus = "FAILED";
      else {
        updateData.winBuildStatus = "FAILED";
        updateData.linuxBuildStatus = "FAILED";
      }

      await prisma.build.update({ where: { id: buildId }, data: updateData });
      await this.appendLog(buildId, logMsg);
      await this.checkAndFinalizeBuild(buildId);

      return { message: "Failure recorded" };
    }

    if (!file) throw new Error("No artifact file provided");

    const pluginSlug = build.plugin.slug;
    const ext = platform === "windows" ? "dll" : "so";
    const artifactKey = `artifacts/${pluginSlug}/${build.buildNumber}/endstone_${pluginSlug}.${ext}`;

    const fileBuffer = await fs.promises.readFile(file.path);
    await storage.upload(artifactKey, fileBuffer, "application/octet-stream");
    
    const artifactUrl = `/api/v1/download/file/${encodeURIComponent(artifactKey)}`;
    const artifactSize = file.size;

    console.log(`[Callback] Stored ${platform} artifact: ${artifactKey} (${artifactSize} bytes)`);

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
    await this.appendLog(buildId, `\n✅ ${emoji} ${platform.charAt(0).toUpperCase() + platform.slice(1)} build completed — ${artifactKey} (${this.formatBytes(artifactSize)})\n`);

    await this.checkAndFinalizeBuild(buildId);

    return { message: `${platform} artifact uploaded` };
  }

  async checkAndFinalizeBuild(buildId: string) {
    const build = await prisma.build.findUnique({
      where: { id: buildId },
      select: {
        winBuildStatus: true, linuxBuildStatus: true, status: true, buildNumber: true, safeScore: true,
        createdAt: true, pluginId: true, commitHash: true, commitMessage: true, branch: true,
        artifactUrlLinux: true, artifactUrlWin: true,
        plugin: { select: { displayName: true, slug: true, repoUrl: true, author: { select: { displayName: true, username: true, avatarUrl: true } } } }
      }
    });

    if (!build) return;

    const winDone = build.winBuildStatus === "SUCCESS" || build.winBuildStatus === "FAILED";
    const linuxDone = build.linuxBuildStatus === "SUCCESS" || build.linuxBuildStatus === "FAILED";

    if (!winDone || !linuxDone) return;

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

    await this.appendLog(buildId, summary);

    await prisma.build.update({
      where: { id: buildId },
      data: { status: finalStatus, duration, finishedAt: new Date() }
    });

    try {
      const webhookUrl = this.getBuildWebhookUrl();
      if (!webhookUrl) {
        console.warn("[Callback] Discord build webhook not configured");
      } else {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://endgit.dev";
        const buildLogLink = `${baseUrl}/builds/${buildId}`;

        const linuxLink = build.artifactUrlLinux ? `[🐧 Download .so](${baseUrl}${build.artifactUrlLinux})` : "❌ Failed";
        const winLink = build.artifactUrlWin ? `[🪟 Download .dll](${baseUrl}${build.artifactUrlWin})` : "❌ Failed";

        const embed = {
          title: `Plugin ${build.plugin.displayName || build.plugin.slug}, Build #${build.buildNumber}`,
          url: buildLogLink,
          color: anySuccess ? 8359053 : 15548997,
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

        const response = await fetch(webhookUrl, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: "EndGit-CI", avatar_url: "https://github.com/fluidicon.png",
            content: anySuccess ? "A new cross-platform C++ build has been completed!" : "❌ A cross-platform C++ build has failed!",
            embeds: [embed]
          })
        });

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(`Discord webhook failed (${response.status}): ${body}`);
        }

        console.log(`[Callback] Discord notification sent for build #${build.buildNumber}`);
      }
    } catch (e: any) {
      console.warn(`[Callback] Discord notification failed: ${e.message}`);
    }
  }

  async appendLog(buildId: string, message: string) {
    await prisma.$executeRaw`UPDATE "builds" SET logs = CONCAT(COALESCE(logs, ''), ${message}::text) WHERE id = ${buildId}`;
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  getBuildWebhookUrl(): string | undefined {
    return process.env.DISCORD_WEBHOOK_BUILD;
  }
}

export const callbackService = new CallbackService();
