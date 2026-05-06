import { prisma } from "@endgit/database";

export class VersionsService {
  async getVersions(slug: string) {
    const plugin = await prisma.plugin.findUnique({ where: { slug } });
    if (!plugin) throw new Error("Plugin not found");

    return await prisma.version.findMany({
      where: { pluginId: plugin.id },
      orderBy: { createdAt: "desc" },
    });
  }

  async createVersion(slug: string, userId: string, trustLevel: string, data: any) {
    const { version, changelog, buildId, fileUrl, fileName, fileSize, fileHash } = data;

    const plugin = await prisma.plugin.findUnique({ where: { slug } });
    if (!plugin) throw new Error("Plugin not found");

    if (plugin.authorId !== userId && trustLevel !== "ADMIN") {
      throw new Error("Not authorized");
    }

    let actualFileUrl = fileUrl;
    let actualFileName = fileName;
    let actualFileSize = fileSize;
    let actualFileHash = fileHash;

    if (buildId) {
      const build = await prisma.build.findUnique({ where: { id: buildId } });
      if (!build || build.pluginId !== plugin.id || build.status !== "SUCCESS") {
        throw new Error("Invalid or unsuccessful build ID");
      }

      if (plugin.pluginType === "CPP") {
        actualFileUrl = JSON.stringify({ linux: build.artifactUrlLinux, win: build.artifactUrlWin });
        actualFileName = `${plugin.slug}-${version}`;
        actualFileSize = (build.artifactSizeLinux || 0) + (build.artifactSizeWin || 0);
      } else {
        actualFileUrl = build.artifactUrl;
        actualFileName = `${plugin.slug}-${version}.zip`;
        actualFileSize = build.artifactSize || 0;
      }
      actualFileHash = "sha256-from-build";
    }

    if (!actualFileUrl || (!actualFileName && plugin.pluginType !== "CPP")) {
      throw new Error("File URL and Name are required");
    }

    await prisma.version.updateMany({
      where: { pluginId: plugin.id },
      data: { isLatest: false },
    });

    const newVersion = await prisma.version.create({
      data: {
        version, changelog, fileUrl: actualFileUrl, fileName: actualFileName,
        fileSize: actualFileSize || 0, fileHash: actualFileHash || "",
        isLatest: true, status: "PENDING", pluginId: plugin.id,
      },
    });

    if (buildId) {
      await prisma.build.update({ where: { id: buildId }, data: { isRelease: true } });
    }

    if (plugin.status === "DRAFT") {
      await prisma.plugin.update({ where: { id: plugin.id }, data: { status: "PENDING_REVIEW" } });
    }

    return newVersion;
  }

  async deleteVersion(slug: string, versionString: string, userId: string, trustLevel: string) {
    const plugin = await prisma.plugin.findUnique({ where: { slug } });
    if (!plugin) throw new Error("Plugin not found");

    if (plugin.authorId !== userId && trustLevel !== "ADMIN") {
      throw new Error("Not authorized");
    }

    const version = await prisma.version.findFirst({
      where: { pluginId: plugin.id, version: versionString },
    });

    if (!version) throw new Error("Version not found");

    await prisma.version.delete({ where: { id: version.id } });

    if (version.isLatest) {
      const nextLatest = await prisma.version.findFirst({
        where: { pluginId: plugin.id },
        orderBy: { createdAt: "desc" },
      });
      if (nextLatest) {
        await prisma.version.update({ where: { id: nextLatest.id }, data: { isLatest: true } });
      }
    }
  }
}

export const versionsService = new VersionsService();
