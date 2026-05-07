import { Request, Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { adminService } from "./admin.service";

export class AdminController {
  async getUsers(req: AuthRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const search = req.query.search as string;

      const { users, total, totalPages } = await adminService.getUsers(page, limit, search);
      res.json({ success: true, data: users, pagination: { page, limit, total, totalPages } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Failed to fetch users" });
    }
  }

  async updateUserTrustLevel(req: AuthRequest, res: Response) {
    try {
      const data = await adminService.updateUserTrustLevel(String(req.params.id), req.body.trustLevel);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(error.message.includes("Invalid") ? 400 : 500).json({ success: false, error: error.message || "Failed to update trust level" });
    }
  }

  async updateUserQuota(req: AuthRequest, res: Response) {
    try {
      const data = await adminService.updateUserQuota(String(req.params.id), parseInt(req.body.weeklyBuildQuota));
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(error.message.includes("must be") ? 400 : 500).json({ success: false, error: error.message || "Failed to update quota" });
    }
  }

  async getStats(req: AuthRequest, res: Response) {
    try {
      const data = await adminService.getSystemStats();
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Failed to fetch stats" });
    }
  }

  async getPlugins(req: AuthRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const search = req.query.search as string;
      const status = req.query.status as string;

      const { plugins, total, totalPages } = await adminService.getPlugins(page, limit, search, status);
      res.json({ success: true, data: plugins, pagination: { page, limit, total, totalPages } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Failed to fetch plugins" });
    }
  }

  async updatePluginStatus(req: AuthRequest, res: Response) {
    try {
      const data = await adminService.updatePluginStatus(String(req.params.id), req.body.status);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(error.message.includes("Invalid") ? 400 : 500).json({ success: false, error: error.message || "Failed to update plugin status" });
    }
  }

  async updateVersionStatus(req: AuthRequest, res: Response) {
    try {
      const data = await adminService.updateVersionStatus(String(req.params.id), req.body.status);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(error.message.includes("Invalid") ? 400 : 500).json({ success: false, error: error.message || "Failed to update version status" });
    }
  }

  async toggleFeatured(req: AuthRequest, res: Response) {
    try {
      const data = await adminService.toggleFeatured(String(req.params.id));
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message || "Failed to toggle featured" });
    }
  }
}

export const adminController = new AdminController();
