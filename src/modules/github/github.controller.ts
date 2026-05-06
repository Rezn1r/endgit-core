import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { githubService } from "./github.service";

export class GithubController {
  async getRepos(req: AuthRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const perPage = parseInt(req.query.per_page as string) || 30;

      const { repos, hasMore } = await githubService.getUserRepos(req.user!.id, page, perPage);
      
      res.json({ success: true, data: repos, pagination: { hasMore, page, perPage } });
    } catch (error: any) {
      console.error("GitHub repos error:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to fetch repositories" });
    }
  }

  async enableCI(req: AuthRequest, res: Response) {
    try {
      const plugin = await githubService.enableCI(req.user!.id, req.body);
      res.status(201).json({
        success: true,
        data: plugin,
        webhook: plugin.webhookId ? "installed" : "failed",
      });
    } catch (error: any) {
      console.error("Enable CI error:", error);
      res.status(error.message.includes("not found") ? 404 : 400).json({ success: false, error: error.message || "Failed to enable CI" });
    }
  }

  async disableCI(req: AuthRequest, res: Response) {
    try {
      await githubService.disableCI(req.user!.id, String(req.params.pluginId));
      res.json({ success: true, message: "CI disabled and webhook removed" });
    } catch (error: any) {
      console.error("Disable CI error:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to disable CI" });
    }
  }

  async getRepoReadme(req: AuthRequest, res: Response) {
    try {
      const { owner, repo } = req.query;
      if (!owner || !repo) {
        return res.status(400).json({ success: false, error: "Missing owner or repo" });
      }

      const text = await githubService.getRepoReadme(req.user!.id, String(owner), String(repo));
      res.json({ success: true, data: text });
    } catch (error: any) {
      console.error("Proxy README error:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to fetch README" });
    }
  }

  async getRepoLicense(req: AuthRequest, res: Response) {
    try {
      const { owner, repo } = req.query;
      if (!owner || !repo) {
        return res.status(400).json({ success: false, error: "Missing owner or repo" });
      }

      const license = await githubService.getRepoLicense(req.user!.id, String(owner), String(repo));
      res.json({ success: true, data: license });
    } catch (error: any) {
      console.error("Proxy license error:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to fetch license" });
    }
  }
}

export const githubController = new GithubController();
