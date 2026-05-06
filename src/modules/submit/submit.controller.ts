import { Request, Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { submitService } from "./submit.service";

export class SubmitController {
  async submitBuild(req: AuthRequest, res: Response) {
    try {
      const data = await submitService.submitBuild(String(req.params.buildId), req.body, req.user!.id);
      res.json({
        success: true,
        message: `Build #${data.buildNumber} submitted for review`,
        data: { pluginId: data.pluginId, buildId: data.buildId }
      });
    } catch (error: any) {
      console.error("Submit for review error:", error);
      const status = error.message.includes("not found") ? 404 : (error.message.includes("authorized") || error.message.includes("own builds") ? 403 : 400);
      res.status(status).json({ success: false, error: error.message || "Failed to submit for review" });
    }
  }

  async getStatus(req: Request, res: Response) {
    try {
      const data = await submitService.getStatus(String(req.params.pluginSlug));
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(error.message === "Plugin not found" ? 404 : 500).json({ success: false, error: error.message || "Failed to fetch review status" });
    }
  }
}

export const submitController = new SubmitController();
