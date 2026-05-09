import { prisma } from "@endgit/database";
import { createStorage } from "@endgit/storage";
import path from "path";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const redis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  family: 4,
  tls: REDIS_URL.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
});

const storage = createStorage();

export class DownloadService {
  async downloadFileByKey(key: string) {
    const exists = await storage.exists(key);
    if (!exists) throw new Error("File not found");

    const file = await storage.download(key);
    const fileName = path.basename(decodeURIComponent(key));

    return { file, fileName };
  }

  async downloadPluginVersion(slug: string, versionString: string, ip: string, platform?: string) {
    const plugin = await prisma.plugin.findUnique({ where: { slug } });
    if (!plugin) throw new Error("Plugin not found");

    const version = await prisma.version.findUnique({
      where: { pluginId_version: { pluginId: plugin.id, version: versionString } },
    });
    if (!version) throw new Error("Version not found");

    let storageKey = version.fileUrl;
    
    try {
      if (storageKey.startsWith("{")) {
        const parsed = JSON.parse(storageKey);
        if (platform === "windows") storageKey = parsed.win;
        else if (platform === "linux") storageKey = parsed.linux;
        else throw new Error("Platform ?platform=linux or ?platform=windows is required for C++ plugins");
      }
    } catch(e: any) {
      if (e.message.includes("required")) throw e;
    }

    const downloadPrefix = "/api/v1/download/file/";
    if (storageKey && storageKey.startsWith(downloadPrefix)) {
      storageKey = decodeURIComponent(storageKey.slice(downloadPrefix.length));
    }

    if (!storageKey) throw new Error("Artifact not found for this platform");

    const file = await storage.download(storageKey);

    const redisKey = `download_spam:${version.id}:${ip}`;
    const isSpam = await redis.get(redisKey);

    if (!isSpam) {
      await redis.set(redisKey, "1", "EX", 86400);

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      await Promise.all([
        prisma.version.update({ where: { id: version.id }, data: { downloads: { increment: 1 } } }),
        prisma.plugin.update({ where: { id: plugin.id }, data: { downloads: { increment: 1 } } }),
        prisma.pluginAnalytics.upsert({
          where: { pluginId_date: { pluginId: plugin.id, date: today } },
          update: { downloads: { increment: 1 } },
          create: { pluginId: plugin.id, date: today, downloads: 1 }
        })
      ]);
    }

    // Extract correct filename from the storage key (most reliable source)
    let finalFileName = path.basename(decodeURIComponent(storageKey));
    
    // Fallback: if storageKey doesn't give a good name, try version.fileName
    if (!finalFileName || !finalFileName.includes('.')) {
      finalFileName = decodeURIComponent(path.basename(version.fileName));
    }
    
    if (finalFileName.startsWith("plugin-")) {
      finalFileName = finalFileName.replace("plugin-", `${plugin.slug}-`);
    }

    if (plugin.pluginType === "CPP" && platform) {
      if (platform === "windows" && !finalFileName.endsWith(".dll")) finalFileName += ".dll";
      else if (platform === "linux" && !finalFileName.endsWith(".so")) finalFileName += ".so";
    }

    return { file, fileName: finalFileName, fileHash: version.fileHash };
  }
}

export const downloadService = new DownloadService();
