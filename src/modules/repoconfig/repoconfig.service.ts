// ─────────────────────────────────────────────────────────
// EndGit Repo Config — Service
// ─────────────────────────────────────────────────────────

import { prisma } from "@endgit/database";
import { parseYaml } from "./yaml-parser";
import { EndGitRepoConfig, validateEndGitConfig } from "./repoconfig.schema";

export class RepoConfigService {
  private cache: Map<string, { data: EndGitRepoConfig | null; timestamp: number }> = new Map();
  private static CACHE_TTL_MS = 60_000; // 60 seconds
  private static FETCH_TIMEOUT_MS = 5_000; // 5 seconds
  private static MAX_CACHE_SIZE = 500;

  private cacheSet(key: string, value: { data: EndGitRepoConfig | null; timestamp: number }): void {
    if (this.cache.size >= RepoConfigService.MAX_CACHE_SIZE && !this.cache.has(key)) {
      // Evict the oldest entry (first key in insertion-order Map)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  async getAccessToken(userId: string): Promise<string | null> {
    const account = await prisma.account.findFirst({
      where: { userId, provider: "github" },
      select: { access_token: true }
    });
    return account?.access_token || null;
  }

  async fetchConfigFromRepo(
    accessToken: string,
    owner: string,
    repo: string,
    branch?: string
  ): Promise<EndGitRepoConfig | null> {
    const cacheKey = `${owner}/${repo}#${branch || "default"}`;
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < RepoConfigService.CACHE_TTL_MS) {
      return cached.data;
    }

    const filenames = [".endgit.yml", ".endgit"];

    for (const filename of filenames) {
      try {
        let url = `https://api.github.com/repos/${owner}/${repo}/contents/${filename}`;
        if (branch) {
          url += `?ref=${encodeURIComponent(branch)}`;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), RepoConfigService.FETCH_TIMEOUT_MS);
        let res: Response;
        try {
          res = await fetch(url, {
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/vnd.github.v3.raw",
              "User-Agent": "EndGit-CI"
            }
          });
        } finally {
          clearTimeout(timeout);
        }

        if (!res.ok) {
          continue;
        }

        const content = await res.text();
        const parsed = parseYaml(content);
        const validation = validateEndGitConfig(parsed);

        if (!validation.valid) {
          console.warn(`[RepoConfig] Validation errors in ${owner}/${repo}/${filename}:`, validation.errors);
          this.cacheSet(cacheKey, { data: null, timestamp: Date.now() });
          return null;
        }

        const config = parsed as EndGitRepoConfig;
        this.cacheSet(cacheKey, { data: config, timestamp: Date.now() });
        return config;
      } catch (error: any) {
        console.warn(`[RepoConfig] Error fetching ${filename} from ${owner}/${repo}:`, error.message);
        continue;
      }
    }

    this.cacheSet(cacheKey, { data: null, timestamp: Date.now() });
    return null;
  }

  mergeConfig(
    fileConfig: EndGitRepoConfig,
    dbPlugin: { displayName: string; iconUrl: string | null; description: string }
  ): { displayName: string; iconUrl: string | null; description: string } {
    return {
      displayName: fileConfig.name || dbPlugin.displayName,
      iconUrl: fileConfig.icon || dbPlugin.iconUrl,
      description: fileConfig.description || dbPlugin.description,
    };
  }
}

export const repoconfigService = new RepoConfigService();
