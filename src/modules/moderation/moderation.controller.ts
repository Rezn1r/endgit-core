import { Request, Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { moderationService } from "./moderation.service";

export class ModerationController {
  async reportPlugin(req: AuthRequest, res: Response) {
    try {
      const data = await moderationService.reportPlugin(String(req.params.slug), req.user!.id, req.body.reason, req.body.details);
      res.status(201).json({ success: true, data });
    } catch (error: any) {
      res.status(error.message === "Plugin not found" ? 404 : (error.message.includes("required") ? 400 : 500)).json({ success: false, error: error.message || "Failed to submit report" });
    }
  }

  async ratePlugin(req: AuthRequest, res: Response) {
    try {
      const data = await moderationService.ratePlugin(String(req.params.slug), req.user!.id, parseInt(req.body.score), req.body.comment);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(error.message === "Plugin not found" ? 404 : (error.message.includes("1-5") ? 400 : 500)).json({ success: false, error: error.message || "Failed to submit rating" });
    }
  }

  async getRatings(req: Request, res: Response) {
    try {
      const data = await moderationService.getRatings(String(req.params.slug));
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(error.message === "Plugin not found" ? 404 : 500).json({ success: false, error: error.message || "Failed to get ratings" });
    }
  }

  async updateTrustLevel(req: AuthRequest, res: Response) {
    try {
      const data = await moderationService.updateTrustLevel(String(req.params.userId), req.body.trustLevel);
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(error.message === "Invalid trust level" ? 400 : 500).json({ success: false, error: error.message || "Failed to update trust level" });
    }
  }
}

export const moderationController = new ModerationController();
