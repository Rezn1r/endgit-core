import { prisma } from "@endgit/database";
import { Queue } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const buildQueue = new Queue("build-jobs", { connection });

const WEBHOOK_SECRET = process.env.ENDGIT_WEBHOOK_SECRET || "endgit-webhook-secret";
const WEBHOOK_URL = process.env.ENDGIT_WEBHOOK_URL || "http://localhost:4000/api/v1/webhooks/github";

export class GithubService {
  async getAccessToken(userId: string): Promise<string | null> {
    const account = await prisma.account.findFirst({
      where: { userId, provider: "github" },
      select: { access_token: true }
    });
    return account?.access_token || null;
  }

  async createGitHubWebhook(accessToken: string, owner: string, repo: string): Promise<number | null> {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "EndGit-CI",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: "web",
          active: true,
          events: ["push"],
          config: {
            url: WEBHOOK_URL,
            content_type: "json",
            secret: WEBHOOK_SECRET,
            insecure_ssl: "0"
          }
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error(`[GitHub] Failed to create webhook: ${res.status}`, err);
        return null;
      }

      const hook = await res.json() as any;
      console.log(`[GitHub] ✅ Webhook created for ${owner}/${repo} (ID: ${hook.id})`);
      return hook.id;
    } catch (error: any) {
      console.error("[GitHub] Webhook creation error:", error.message);
      return null;
    }
  }

  async deleteGitHubWebhook(accessToken: string, owner: string, repo: string, hookId: number): Promise<boolean> {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/hooks/${hookId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "EndGit-CI"
        }
      });
      if (res.ok || res.status === 204) {
        console.log(`[GitHub] 🗑️ Webhook ${hookId} deleted from ${owner}/${repo}`);
        return true;
      }
      return false;
    } catch (error: any) {
      console.error("[GitHub] Webhook deletion error:", error.message);
      return false;
    }
  }

  async getUserRepos(userId: string, page: number, perPage: number) {
    const accessToken = await this.getAccessToken(userId);
    if (!accessToken) throw new Error("GitHub account not linked");

    const ghRes = await fetch(`https://api.github.com/user/repos?sort=updated&per_page=${perPage}&page=${page}&affiliation=owner,collaborator,organization_member`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "EndGit-CI"
      }
    });

    if (!ghRes.ok) throw new Error("Failed to fetch from GitHub");

    let hasMore = false;
    const linkHeader = ghRes.headers.get("link");
    if (linkHeader && linkHeader.includes('rel="next"')) hasMore = true;

    const ghRepos = await ghRes.json() as any[];

    const existingPlugins = await prisma.plugin.findMany({
      where: { authorId: userId },
      select: { id: true, repoUrl: true, slug: true, status: true, name: true, webhookId: true }
    });

    const repoUrlMap = new Map(existingPlugins.map(p => [p.repoUrl, p]));

    const repos = ghRepos.map((repo: any) => {
      const linked = repoUrlMap.get(repo.html_url);
      return {
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        htmlUrl: repo.html_url,
        description: repo.description,
        language: repo.language,
        private: repo.private,
        defaultBranch: repo.default_branch,
        updatedAt: repo.updated_at,
        ciEnabled: !!(linked && linked.webhookId),
        pluginId: linked?.id || null,
        pluginSlug: linked?.slug || null,
        pluginStatus: linked?.status || null,
      };
    });

    return { repos, hasMore };
  }

  async enableCI(userId: string, repoData: any) {
    const { name, fullName, htmlUrl, language, defaultBranch, description } = repoData;

    const existing = await prisma.plugin.findFirst({
      where: { repoUrl: htmlUrl, authorId: userId }
    });
    if (existing && existing.webhookId) {
      throw new Error("CI already enabled for this repo");
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");

    if (language !== "C++" && language !== "Python" && language !== "C") {
      throw new Error(`Unsupported repository language: ${language || 'Unknown'}. Only C++ and Python are supported for Endstone plugins.`);
    }

    const pluginType = (language === "C++" || language === "C") ? "CPP" : "PYTHON";
    const accessToken = await this.getAccessToken(userId);

    if (!accessToken || !fullName) throw new Error("GitHub account not linked properly");

    const [owner, repo] = fullName.split("/");

    const contentsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github.v3+json", "User-Agent": "EndGit-CI" }
    });

    if (contentsRes.ok) {
      const contents = await contentsRes.json();
      if (Array.isArray(contents)) {
        let isValidEndstone = false;

        const checkFileContent = async (exactFilename: string) => {
          try {
            const fileRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${exactFilename}`, {
              headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github.v3+json", "User-Agent": "EndGit-CI" }
            });
            if (fileRes.ok) {
              const fileData = await fileRes.json() as any;
              if (fileData.content) {
                const decodedContent = Buffer.from(fileData.content, 'base64').toString('utf-8').toLowerCase();
                return decodedContent.includes('endstone');
              }
            }
          } catch (e) {}
          return false;
        };

        const checkCandidates = ['pyproject.toml', 'cmakelists.txt', 'setup.py', 'requirements.txt'];
        for (const candidate of checkCandidates) {
          if (isValidEndstone) break;
          const matchedFile = contents.find((f: any) => f.name.toLowerCase() === candidate);
          if (matchedFile) isValidEndstone = await checkFileContent(matchedFile.name);
        }

        if (!isValidEndstone) {
          throw new Error("Repository does not appear to be an Endstone plugin. The word 'endstone' must exist in pyproject.toml, CMakeLists.txt, setup.py, or requirements.txt.");
        }
      }
    }

    const webhookId = await this.createGitHubWebhook(accessToken, owner, repo);

    if (!webhookId) {
      throw new Error(`Unable to create webhook for ${fullName}. Please ensure the EndGit GitHub App is installed on the organization.`);
    }

    let finalSlug = slug;
    let plugin;
    
    if (existing) {
      plugin = await prisma.plugin.update({
        where: { id: existing.id },
        data: { webhookId: String(webhookId) }
      });
    } else {
      let isUnique = false;
      while (!isUnique) {
        const check = await prisma.plugin.findUnique({ where: { slug: finalSlug } });
        if (check) finalSlug = `${slug}-${Math.floor(Math.random() * 10000)}`;
        else isUnique = true;
      }

      plugin = await prisma.plugin.create({
        data: {
          name: finalSlug,
          slug: finalSlug,
          displayName: name,
          description: description || `${name} — Endstone plugin`,
          repoUrl: htmlUrl,
          pluginType,
          status: "DRAFT",
          authorId: userId,
          webhookId: String(webhookId),
        }
      });
    }

    if (!existing) {
      const buildNumber = await prisma.build.count({ where: { pluginId: plugin.id } }) + 1;
      const build = await prisma.build.create({
        data: {
          buildNumber,
          pluginId: plugin.id,
          status: "QUEUED",
          branch: defaultBranch || "main",
          commitMessage: "Initial build triggered by enabling CI",
          triggerType: "MANUAL",
        }
      });

      await buildQueue.add("build-plugin", {
        pluginId: plugin.id,
        pluginSlug: plugin.slug,
        repoUrl: plugin.repoUrl,
        buildId: build.id,
        userId: plugin.authorId,
        branch: defaultBranch || "main",
        commitMessage: "Initial build triggered by enabling CI",
      });
    }

    return plugin;
  }

  async disableCI(userId: string, pluginId: string) {
    const plugin = await prisma.plugin.findFirst({
      where: { id: pluginId, authorId: userId }
    });

    if (!plugin) throw new Error("Plugin not found");

    if (plugin.webhookId && plugin.repoUrl) {
      const accessToken = await this.getAccessToken(userId);
      if (accessToken) {
        const match = plugin.repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
        if (match) {
          await this.deleteGitHubWebhook(accessToken, match[1], match[2], parseInt(plugin.webhookId));
        }
      }
    }

    await prisma.plugin.update({
      where: { id: plugin.id },
      data: { webhookId: null }
    });
  }

  async getRepoReadme(userId: string, owner: string, repo: string) {
    const accessToken = await this.getAccessToken(userId);
    const headers: any = { Accept: "application/vnd.github.v3.raw", "User-Agent": "EndGit-CI" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, { headers });
    if (!ghRes.ok) throw new Error("README not found");

    return ghRes.text();
  }

  async getRepoLicense(userId: string, owner: string, repo: string) {
    const accessToken = await this.getAccessToken(userId);
    const headers: any = { Accept: "application/vnd.github.v3+json", "User-Agent": "EndGit-CI" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/license`, { headers });
    if (!ghRes.ok) throw new Error("License not found");

    const data = await ghRes.json() as any;
    return data.license;
  }
}

export const githubService = new GithubService();
