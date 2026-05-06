import { prisma } from "@endgit/database";

export class BuildsService {
  async getRecentBuilds(page: number, limit: number, status?: string, branch?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;
    if (branch) where.branch = branch;

    const [builds, total] = await Promise.all([
      prisma.build.findMany({
        where, skip, take: limit, orderBy: { createdAt: "desc" }, distinct: ['pluginId'],
        include: {
          plugin: { select: { name: true, displayName: true, slug: true, pluginType: true, iconUrl: true, author: { select: { username: true, avatarUrl: true } } } }
        }
      }),
      prisma.build.count({ where })
    ]);

    return { builds, total, totalPages: Math.ceil(total / limit) };
  }

  async getMyBuilds(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    return await prisma.build.findMany({
      where: { plugin: { authorId: userId } },
      skip, take: limit, orderBy: { createdAt: "desc" },
      include: { plugin: { select: { name: true, displayName: true, slug: true, pluginType: true } } }
    });
  }

  async getPluginBuilds(slug: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const buildWhere = { plugin: { slug } };

    const [plugin, builds, total] = await Promise.all([
      prisma.plugin.findUnique({
        where: { slug },
        select: { 
          id: true, name: true, displayName: true, status: true, reviewBuildId: true, pluginType: true,
          versions: { select: { status: true, fileHash: true, version: true, fileUrl: true } }
        }
      }),
      prisma.build.findMany({
        where: buildWhere, skip, take: limit, orderBy: { createdAt: "desc" },
        select: {
          id: true, buildNumber: true, commitHash: true, commitMessage: true, branch: true,
          status: true, isRelease: true, artifactUrl: true, artifactUrlLinux: true, artifactUrlWin: true,
          duration: true, createdAt: true, finishedAt: true
        }
      }),
      prisma.build.count({ where: buildWhere })
    ]);

    if (!plugin) throw new Error("Plugin not found");

    const buildsWithVersion = builds.map((build: any) => {
      let expectedFileUrl = build.artifactUrl || "";
      if (plugin.pluginType === "CPP") {
        expectedFileUrl = JSON.stringify({ linux: build.artifactUrlLinux, win: build.artifactUrlWin });
      }

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

    return { plugin, builds: buildsWithVersion, total, totalPages: Math.ceil(total / limit) };
  }

  async getBuildDetail(buildId: string) {
    const build = await prisma.build.findUnique({
      where: { id: buildId },
      include: {
        plugin: {
          select: {
            name: true, displayName: true, slug: true, pluginType: true, status: true,
            reviewBuildId: true, description: true, longDescription: true, tags: true,
            keywords: true, license: true, repoUrl: true,
            author: { select: { username: true, avatarUrl: true } },
            versions: { orderBy: { createdAt: "desc" as const }, take: 1, select: { version: true, supportedApis: true } }
          }
        }
      }
    });

    if (!build) throw new Error("Build not found");
    return build;
  }

  async getBuildStreamData(buildId: string) {
    return await prisma.build.findUnique({
      where: { id: buildId },
      select: { logs: true, status: true, safeScore: true, duration: true, finishedAt: true }
    });
  }
}

export const buildsService = new BuildsService();
