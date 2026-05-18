// ─────────────────────────────────────────────────────────
// EndGit Repo Config — Controller
// ─────────────────────────────────────────────────────────

import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { prisma } from "@endgit/database";
import { repoconfigService } from "./repoconfig.service";

export class RepoConfigController {
  async getConfig(req: AuthRequest, res: Response) {
    try {
      const { pluginSlug } = req.params;

      if (!pluginSlug) {
        return res.status(400).json({ success: false, error: "Missing pluginSlug parameter" });
      }

      const plugin = await prisma.plugin.findUnique({
        where: { slug: pluginSlug },
        select: {
          id: true,
          slug: true,
          displayName: true,
          iconUrl: true,
          description: true,
          repoUrl: true,
          authorId: true,
        }
      });

      if (!plugin) {
        return res.status(404).json({ success: false, error: "Plugin not found" });
      }

      if (!plugin.repoUrl) {
        return res.status(400).json({ success: false, error: "Plugin has no linked repository" });
      }

      // Authorization: only plugin owner or admins can access config
      if (req.user!.id !== plugin.authorId && req.user!.trustLevel !== "ADMIN") {
        return res.status(403).json({ success: false, error: "You do not have permission to access this plugin's config" });
      }

      const accessToken = await repoconfigService.getAccessToken(plugin.authorId);
      if (!accessToken) {
        return res.status(400).json({ success: false, error: "GitHub account not linked for plugin author" });
      }

      const match = plugin.repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!match) {
        return res.status(400).json({ success: false, error: "Invalid repository URL" });
      }

      const [, owner, repo] = match;
      const config = await repoconfigService.fetchConfigFromRepo(accessToken, owner, repo);

      if (!config) {
        return res.json({ success: true, data: null, message: "No .endgit.yml config found" });
      }

      const merged = repoconfigService.mergeConfig(config, {
        displayName: plugin.displayName,
        iconUrl: plugin.iconUrl,
        description: plugin.description,
      });

      res.json({
        success: true,
        data: {
          raw: config,
          merged,
        }
      });
    } catch (error: any) {
      console.error("[RepoConfig] getConfig error:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to fetch config" });
    }
  }
}

export const repoconfigController = new RepoConfigController();
