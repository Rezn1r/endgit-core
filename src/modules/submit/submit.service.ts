import { prisma } from "@endgit/database";

export class SubmitService {
  async submitBuild(buildId: string, data: any, userId: string) {
    const build = await prisma.build.findUnique({
      where: { id: buildId },
      include: { plugin: { select: { id: true, authorId: true, status: true, name: true, iconUrl: true, repoUrl: true } } }
    });

    if (!build) throw new Error("Build not found");
    if (build.plugin.authorId !== userId) throw new Error("You can only submit your own builds");
    if (build.status !== "SUCCESS") throw new Error("Only successful builds can be submitted for review");

    const hasPendingVersion = await prisma.version.findFirst({
      where: { pluginId: build.pluginId, status: "PENDING" }
    });

    if (hasPendingVersion || build.plugin.status === "PENDING_REVIEW") {
      throw new Error("A version is currently pending review. Please wait for it to be approved or rejected.");
    }

    const latestRelease = await prisma.build.findFirst({
      where: { pluginId: build.pluginId, isRelease: true },
      orderBy: { buildNumber: "desc" }
    });

    if (latestRelease && build.buildNumber <= latestRelease.buildNumber) {
      throw new Error(`You cannot submit a build older than or equal to the latest submitted build (#${latestRelease.buildNumber}).`);
    }

    const { version, displayName, description, longDescription, tags, keywords, license, iconPath, producers, changelog, supportedApis } = data;

    if (!version || !displayName) throw new Error("Version and Display Name are required");

    const existingVersion = await prisma.version.findFirst({
      where: { pluginId: build.plugin.id, version }
    });

    if (existingVersion && existingVersion.status !== "REJECTED") {
      throw new Error(`Version ${version} already exists and is not rejected. Please increment your version number.`);
    }

    if (!producers || !Array.isArray(producers) || producers.length === 0) {
      throw new Error("At least one producer is required");
    }
    
    const uniqueUsernames = new Set(producers.map(p => p.githubUser.trim().toLowerCase()));
    if (uniqueUsernames.size !== producers.length) {
      throw new Error("Duplicate producer usernames are not allowed");
    }

    for (const p of producers) {
      const username = p.githubUser.trim();
      if (!username) continue;
      try {
        const ghRes = await fetch(`https://api.github.com/users/${username}`);
        if (!ghRes.ok && ghRes.status === 404) {
          throw new Error(`GitHub user '${username}' does not exist.`);
        }
      } catch (err: any) {
        if (err.message.includes("does not exist")) throw err;
      }
    }

    let processedTags: string[] = [];
    if (tags && typeof tags === "string") {
      processedTags = tags.split(",").map(t => t.replace(/<[^>]*>?/gm, '').trim()).filter(Boolean);
    }

    let processedKeywords: string[] = [];
    if (keywords && typeof keywords === "string") {
      processedKeywords = keywords.split(",").map(k => k.replace(/<[^>]*>?/gm, '').trim()).filter(Boolean);
    }

    let iconUrl = build.plugin.iconUrl;
    if (build.plugin.repoUrl) {
      const repoPath = build.plugin.repoUrl.replace("https://github.com/", "").replace(/\/$/, "");
      const commit = build.commitHash || "main";
      const path = iconPath ? iconPath.replace(/^\//, "") : "icon.png";
      iconUrl = `https://raw.githubusercontent.com/${repoPath}/${commit}/${path}`;
    }

    await prisma.$transaction(async (tx) => {
      const existingPlugin = await tx.plugin.findUnique({ where: { id: build.plugin.id } });
      const newStatus = existingPlugin?.status === "APPROVED" ? "APPROVED" : "PENDING_REVIEW";

      await tx.plugin.update({
        where: { id: build.plugin.id },
        data: {
          status: newStatus,
          reviewBuildId: build.id,
          displayName,
          description: description || build.plugin.name,
          longDescription: longDescription || "",
          tags: processedTags,
          keywords: processedKeywords,
          license: license || "",
          iconUrl,
        }
      });

      let versionFileUrl = build.artifactUrl || "";
      let versionFileName = build.artifactUrl ? build.artifactUrl.split('/').pop()! : `build-${build.buildNumber}.zip`;
      let versionFileSize = build.artifactSize || 0;

      const pluginFull = await tx.plugin.findUnique({ where: { id: build.plugin.id }, select: { pluginType: true } });
      if (pluginFull?.pluginType === "CPP") {
        versionFileUrl = JSON.stringify({ linux: build.artifactUrlLinux, win: build.artifactUrlWin });
        versionFileName = `plugin-${version}-cpp`;
        versionFileSize = (build.artifactSizeLinux || 0) + (build.artifactSizeWin || 0);
      }

      if (existingVersion) {
        await tx.producer.deleteMany({ where: { versionId: existingVersion.id } });
        await tx.version.update({
          where: { id: existingVersion.id },
          data: {
            fileUrl: versionFileUrl, fileName: versionFileName, fileSize: versionFileSize, fileHash: build.commitHash || "",
            status: "PENDING", changelog: changelog || data.notes || "", longDescription: longDescription || "",
            supportedApis: Array.isArray(supportedApis) ? supportedApis : [], isLatest: true, createdAt: new Date(),
            producers: { create: producers.map((p: any) => ({ githubUser: p.githubUser.trim(), role: p.role })) }
          }
        });
      } else {
        await tx.version.create({
          data: {
            pluginId: build.plugin.id, version, fileUrl: versionFileUrl, fileName: versionFileName, fileSize: versionFileSize,
            fileHash: build.commitHash || "", status: "PENDING", changelog: changelog || data.notes || "",
            longDescription: longDescription || "", supportedApis: Array.isArray(supportedApis) ? supportedApis : [], isLatest: true,
            producers: { create: producers.map((p: any) => ({ githubUser: p.githubUser.trim(), role: p.role })) }
          }
        });
      }

      await tx.build.update({
        where: { id: build.id },
        data: { isRelease: true }
      });
    });

    return { pluginId: build.plugin.id, buildId: build.id, buildNumber: build.buildNumber };
  }

  async getStatus(pluginSlug: string) {
    const plugin = await prisma.plugin.findUnique({
      where: { slug: pluginSlug },
      select: {
        id: true, status: true, reviewBuildId: true,
        reviews: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { decision: true, comment: true, createdAt: true, reviewer: { select: { username: true } } }
        }
      }
    });

    if (!plugin) throw new Error("Plugin not found");

    return {
      status: plugin.status,
      reviewBuildId: plugin.reviewBuildId,
      latestReview: plugin.reviews[0] || null
    };
  }
}

export const submitService = new SubmitService();
