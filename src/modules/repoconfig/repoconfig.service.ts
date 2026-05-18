// ─────────────────────────────────────────────────────────
// EndGit Repo Config — Service
// ─────────────────────────────────────────────────────────

import { prisma } from "@endgit/database";
import { parseYaml } from "./yaml-parser";
import { EndGitRepoConfig, validateEndGitConfig } from "./repoconfig.schema";

export class RepoConfigService {
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
    const filenames = [".endgit.yml", ".endgit"];

    for (const filename of filenames) {
      try {
        let url = `https://api.github.com/repos/${owner}/${repo}/contents/${filename}`;
        if (branch) {
          url += `?ref=${encodeURIComponent(branch)}`;
        }

        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3.raw",
            "User-Agent": "EndGit-CI"
          }
        });

        if (!res.ok) {
          continue;
        }

        const content = await res.text();
        const parsed = parseYaml(content);
        const validation = validateEndGitConfig(parsed);

        if (!validation.valid) {
          console.warn(`[RepoConfig] Validation errors in ${owner}/${repo}/${filename}:`, validation.errors);
          return null;
        }

        return parsed as EndGitRepoConfig;
      } catch (error: any) {
        console.warn(`[RepoConfig] Error fetching ${filename} from ${owner}/${repo}:`, error.message);
        continue;
      }
    }

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
