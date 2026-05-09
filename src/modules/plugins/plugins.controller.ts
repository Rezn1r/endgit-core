import { Request, Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { pluginsService } from "./plugins.service";

export class PluginsController {
  async listPlugins(req: Request, res: Response) {
    try {
      const data = await pluginsService.listPlugins(req.query);
      res.json({ success: true, data: { plugins: data.plugins }, pagination: { page: data.page, pageSize: data.pageSize, total: data.total, totalPages: data.totalPages } });
    } catch (error: any) {
      console.error("List plugins error:", error);
      res.status(500).json({ success: false, error: "Failed to list plugins" });
    }
  }

  async getAnalytics(req: Request, res: Response) {
    try {
      const data = await pluginsService.getAnalytics(String(req.params.slug));
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(error.message === "Plugin not found" ? 404 : 500).json({ success: false, error: error.message || "Failed to get analytics" });
    }
  }

  async getDependencies(req: Request, res: Response) {
    try {
      const data = await pluginsService.getDependencies(String(req.params.slug));
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(error.message === "No version found" ? 404 : 500).json({ success: false, error: error.message || "Failed to get dependencies" });
    }
  }

  async getTrending(req: Request, res: Response) {
    try {
      const data = await pluginsService.getTrending();
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Failed to get trending plugins" });
    }
  }

  async getLatest(req: Request, res: Response) {
    try {
      const data = await pluginsService.getLatest();
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Failed to get latest plugins" });
    }
  }

  async getGlobalStats(_req: Request, res: Response) {
    try {
      const data = await pluginsService.getGlobalStats();
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Failed to get global stats" });
    }
  }

  async getBySlug(req: Request, res: Response) {
    try {
      const user = (req as AuthRequest).user;
      const data = await pluginsService.getBySlug(String(req.params.slug), user);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(404).json({ success: false, error: "Plugin not found" });
    }
  }

  async createPlugin(req: AuthRequest, res: Response) {
    try {
      const data = await pluginsService.createPlugin(req.body, req.user!.id);
      res.status(201).json({ success: true, data });
    } catch (error: any) {
      res.status(error.message.includes("exists") || error.message.includes("required") ? 400 : 500)
         .json({ success: false, error: error.message || "Failed to create plugin" });
    }
  }

  async updatePlugin(req: AuthRequest, res: Response) {
    try {
      const data = await pluginsService.updatePlugin(String(req.params.slug), req.body, req.user!);
      res.json({ success: true, data });
    } catch (error: any) {
      const status = error.message === "Not authorized" ? 403 : (error.message === "Plugin not found" ? 404 : 500);
      res.status(status).json({ success: false, error: error.message || "Failed to update plugin" });
    }
  }

  async deletePlugin(req: AuthRequest, res: Response) {
    try {
      await pluginsService.deletePlugin(String(req.params.slug), req.user!);
      res.json({ success: true, message: "Plugin deleted" });
    } catch (error: any) {
      const status = error.message === "Not authorized" ? 403 : (error.message === "Plugin not found" ? 404 : 500);
      res.status(status).json({ success: false, error: error.message || "Failed to delete plugin" });
    }
  }

  async triggerBuild(req: AuthRequest, res: Response) {
    try {
      const jobId = await pluginsService.triggerBuild(String(req.params.slug), req.body, req.user!);
      res.status(202).json({ success: true, data: { jobId, message: "Build queued" } });
    } catch (error: any) {
      const status = error.message === "Not authorized" ? 403 : (error.message === "Plugin not found" ? 404 : 400);
      res.status(status).json({ success: false, error: error.message || "Failed to queue build" });
    }
  }
}

export const pluginsController = new PluginsController();
