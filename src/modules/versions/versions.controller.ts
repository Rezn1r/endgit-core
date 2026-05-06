import { Request, Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { versionsService } from "./versions.service";

export class VersionsController {
  async getVersions(req: Request, res: Response) {
    try {
      const data = await versionsService.getVersions(String(req.params.slug));
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(error.message === "Plugin not found" ? 404 : 500).json({ success: false, error: error.message || "Failed to fetch versions" });
    }
  }

  async createVersion(req: AuthRequest, res: Response) {
    try {
      const data = await versionsService.createVersion(String(req.params.slug), req.user!.id, req.user!.trustLevel, req.body);
      res.status(201).json({ success: true, data });
    } catch (error: any) {
      if (error.code === 'P2002') return res.status(409).json({ success: false, error: "Version already exists" });
      const status = error.message === "Plugin not found" ? 404 : (error.message === "Not authorized" ? 403 : 400);
      res.status(status).json({ success: false, error: error.message || "Failed to create version" });
    }
  }

  async deleteVersion(req: AuthRequest, res: Response) {
    try {
      await versionsService.deleteVersion(String(req.params.slug), String(req.params.version), req.user!.id, req.user!.trustLevel);
      res.json({ success: true, message: "Version deleted" });
    } catch (error: any) {
      const status = error.message.includes("not found") ? 404 : (error.message === "Not authorized" ? 403 : 500);
      res.status(status).json({ success: false, error: error.message || "Failed to delete version" });
    }
  }
}

export const versionsController = new VersionsController();
