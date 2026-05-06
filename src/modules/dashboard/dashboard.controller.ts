import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { dashboardService } from "./dashboard.service";

export class DashboardController {
  async getStatus(req: AuthRequest, res: Response) {
    try {
      const data = await dashboardService.getStatus(req.user!.id);
      res.json({ success: true, data });
    } catch (error: any) {
      console.error("Status check error:", error);
      res.status(500).json({ success: false, error: "Failed to check status" });
    }
  }

  async getPlugins(req: AuthRequest, res: Response) {
    try {
      const data = await dashboardService.getMyPlugins(req.user!.id);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Failed to get plugins" });
    }
  }

  async getStats(req: AuthRequest, res: Response) {
    try {
      const data = await dashboardService.getMyStats(req.user!.id);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Failed to get stats" });
    }
  }
}

export const dashboardController = new DashboardController();
