// ─────────────────────────────────────────────────────────
// GitHub Integration Routes
// Manages repos, creates/deletes webhooks on Enable/Disable CI
// ─────────────────────────────────────────────────────────

import { Router, Response } from "express";
import { prisma } from "@endgit/database";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const githubRouter: Router = Router();

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const buildQueue = new Queue("build-jobs", { connection });

const WEBHOOK_SECRET = process.env.ENDGIT_WEBHOOK_SECRET || "endgit-webhook-secret";
const WEBHOOK_URL = process.env.ENDGIT_WEBHOOK_URL || "http://localhost:4000/api/v1/webhooks/github";

/**
 * Helper: Get user's GitHub access token
 */
async function getAccessToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "github" },
    select: { access_token: true }
  });
  return account?.access_token || null;
}

/**
 * Helper: Create GitHub webhook on a repository
 */
async function createGitHubWebhook(accessToken: string, owner: string, repo: string): Promise<number | null> {
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

/**
 * Helper: Delete GitHub webhook from a repository
 */
async function deleteGitHubWebhook(accessToken: string, owner: string, repo: string, hookId: number): Promise<boolean> {
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

/**
 * GET /api/v1/github/repos — List user's GitHub repositories
 */
githubRouter.get("/repos", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const accessToken = await getAccessToken(req.user!.id);
    if (!accessToken) {
      return res.status(401).json({ success: false, error: "GitHub account not linked" });
    }

    const page = parseInt(req.query.page as string) || 1;
    const perPage = parseInt(req.query.per_page as string) || 30;

    const ghRes = await fetch(`https://api.github.com/user/repos?sort=updated&per_page=${perPage}&page=${page}&affiliation=owner,collaborator,organization_member`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "EndGit-CI"
      }
    });

    if (!ghRes.ok) {
      return res.status(502).json({ success: false, error: "Failed to fetch from GitHub" });
    }

    let hasMore = false;
    const linkHeader = ghRes.headers.get("link");
    if (linkHeader && linkHeader.includes('rel="next"')) {
      hasMore = true;
    }

    const ghRepos = await ghRes.json() as any[];

    const existingPlugins = await prisma.plugin.findMany({
      where: { authorId: req.user!.id },
      select: { id: true, repoUrl: true, slug: true, status: true, name: true }
    });

    const repoUrlMap = new Map(existingPlugins.map(p => [p.repoUrl, p]));

    const repos = ghRepos.map((repo: any) => {
      const linked = repoUrlMap.get(repo.html_url);
      return {
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        language: repo.language,
        isPrivate: repo.private,
        htmlUrl: repo.html_url,
        defaultBranch: repo.default_branch,
        stargazersCount: repo.stargazers_count,
        updatedAt: repo.updated_at,
        ciEnabled: !!linked,
        pluginId: linked?.id || null,
        pluginSlug: linked?.slug || null,
        pluginStatus: linked?.status || null,
      };
    });

    res.json({ success: true, data: repos, pagination: { hasMore, page, perPage } });
  } catch (error: any) {
    console.error("GitHub repos error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch repositories" });
  }
});

/**
 * POST /api/v1/github/repos/:repoId/enable — Enable CI for a GitHub repo
 * 1. Creates Plugin entry
 * 2. Installs GitHub webhook on the repo
 */
githubRouter.post("/repos/:repoId/enable", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, fullName, htmlUrl, language, defaultBranch, description } = req.body;

    // Check if plugin already exists
    const existing = await prisma.plugin.findFirst({
      where: { repoUrl: htmlUrl, authorId: req.user!.id }
    });
    if (existing) {
      return res.status(409).json({ success: false, error: "CI already enabled for this repo" });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
    
    // Strict language filter
    if (language !== "C++" && language !== "Python" && language !== "C") {
      return res.status(400).json({ success: false, error: `Unsupported repository language: ${language || 'Unknown'}. Only C++ and Python are supported for Endstone plugins.` });
    }

    const pluginType = (language === "C++" || language === "C") ? "CPP" : "PYTHON";

    // Get access token for webhook creation
    const accessToken = await getAccessToken(req.user!.id);

    if (!accessToken || !fullName) {
      return res.status(400).json({ success: false, error: "GitHub account not linked properly" });
    }

    const [owner, repo] = fullName.split("/");

    // Verify repository contents for Endstone plugin indicators
    const contentsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "EndGit-CI"
      }
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
              const fileData = await fileRes.json();
              if (fileData.content) {
                const decodedContent = Buffer.from(fileData.content, 'base64').toString('utf-8').toLowerCase();
                return decodedContent.includes('endstone');
              }
            }
          } catch (e) { console.warn("Failed to read file", exactFilename); }
          return false;
        };

        const checkCandidates = ['pyproject.toml', 'cmakelists.txt', 'setup.py', 'requirements.txt'];
        for (const candidate of checkCandidates) {
          if (isValidEndstone) break;
          const matchedFile = contents.find((f: any) => f.name.toLowerCase() === candidate);
          if (matchedFile) {
            isValidEndstone = await checkFileContent(matchedFile.name);
          }
        }

        if (!isValidEndstone) {
          return res.status(400).json({ 
            success: false, 
            error: "Repository does not appear to be an Endstone plugin. The word 'endstone' must exist in pyproject.toml, CMakeLists.txt, setup.py, or requirements.txt." 
          });
        }
      }
    } else {
      console.warn(`Failed to verify repository contents for ${fullName}`);
    }

    // Create webhook on GitHub repo
    let webhookId: number | null = null;
    webhookId = await createGitHubWebhook(accessToken, owner, repo);

    // Create or Update plugin entry
    let finalSlug = slug;
    let existingPlugin = await prisma.plugin.findFirst({
      where: { name: finalSlug, authorId: req.user!.id }
    });

    let plugin;
    if (existingPlugin && !existingPlugin.repoUrl) {
      // Re-link existing plugin
      plugin = await prisma.plugin.update({
        where: { id: existingPlugin.id },
        data: {
          repoUrl: htmlUrl,
          webhookId: webhookId ? String(webhookId) : null,
          status: "DRAFT"
        }
      });
    } else {
      // Ensure slug is unique globally
      let isUnique = false;
      while (!isUnique) {
        const check = await prisma.plugin.findUnique({ where: { slug: finalSlug } });
        if (check) {
          finalSlug = `${slug}-${Math.floor(Math.random() * 10000)}`;
        } else {
          isUnique = true;
        }
      }
      
      plugin = await prisma.plugin.create({
        data: {
          name: finalSlug,
          slug: finalSlug,
          displayName: name,
          description: description || `${name} — Endstone plugin`,
          repoUrl: htmlUrl,
          pluginType,
          status: "DRAFT", // Remains DRAFT until submitted for review
          authorId: req.user!.id,
          webhookId: webhookId ? String(webhookId) : null,
        }
      });
    }

    // Trigger initial build
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

    // Removed plugin status update to preserve marketplace lifecycle
    res.status(201).json({
      success: true,
      data: plugin,
      webhook: webhookId ? "installed" : "failed (CI will work via manual triggers)",
    });
  } catch (error: any) {
    console.error("Enable CI error:", error);
    res.status(500).json({ success: false, error: "Failed to enable CI" });
  }
});

/**
 * POST /api/v1/github/repos/:pluginId/disable — Disable CI for a plugin
 * 1. Removes GitHub webhook
 * 2. Soft-deletes plugin CI link
 */
githubRouter.post("/repos/:pluginId/disable", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const plugin = await prisma.plugin.findFirst({
      where: { id: String(req.params.pluginId), authorId: req.user!.id }
    });

    if (!plugin) {
      return res.status(404).json({ success: false, error: "Plugin not found" });
    }

    // Delete webhook from GitHub if we have the hook ID
    if (plugin.webhookId && plugin.repoUrl) {
      const accessToken = await getAccessToken(req.user!.id);
      if (accessToken) {
        // Extract owner/repo from URL
        const match = plugin.repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
        if (match) {
          await deleteGitHubWebhook(accessToken, match[1], match[2], parseInt(plugin.webhookId));
        }
      }
    }

    // Soft delete: set status to DRAFT and remove repo link + webhook
    await prisma.plugin.update({
      where: { id: plugin.id },
      data: { status: "DRAFT", repoUrl: null, webhookId: null }
    });

    res.json({ success: true, message: "CI disabled and webhook removed" });
  } catch (error: any) {
    console.error("Disable CI error:", error);
    res.status(500).json({ success: false, error: "Failed to disable CI" });
  }
});

/**
 * GET /api/v1/github/repo-readme?owner=X&repo=Y — Proxy GitHub README fetch (authenticated)
 */
githubRouter.get("/repo-readme", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { owner, repo } = req.query;
    if (!owner || !repo) {
      return res.status(400).json({ success: false, error: "Missing owner or repo" });
    }

    const accessToken = await getAccessToken(req.user!.id);
    const headers: any = { Accept: "application/vnd.github.v3.raw", "User-Agent": "EndGit-CI" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, { headers });
    if (!ghRes.ok) {
      return res.status(ghRes.status).json({ success: false, error: "README not found" });
    }

    const text = await ghRes.text();
    res.json({ success: true, data: text });
  } catch (error: any) {
    console.error("Proxy README error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch README" });
  }
});

/**
 * GET /api/v1/github/repo-license?owner=X&repo=Y — Proxy GitHub license fetch (authenticated)
 */
githubRouter.get("/repo-license", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { owner, repo } = req.query;
    if (!owner || !repo) {
      return res.status(400).json({ success: false, error: "Missing owner or repo" });
    }

    const accessToken = await getAccessToken(req.user!.id);
    const headers: any = { Accept: "application/vnd.github.v3+json", "User-Agent": "EndGit-CI" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/license`, { headers });
    if (!ghRes.ok) {
      return res.status(ghRes.status).json({ success: false, error: "License not found" });
    }

    const data = await ghRes.json();
    res.json({ success: true, data: data.license });
  } catch (error: any) {
    console.error("Proxy license error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch license" });
  }
});
