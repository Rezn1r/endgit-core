import { Request, Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { ratingsService } from "./ratings.service";

export class RatingsController {
  async getRatings(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

      const { ratings, total, totalPages } = await ratingsService.getRatings(String(req.params.slug), page, limit);
      res.json({ success: true, data: ratings, pagination: { page, limit, total, totalPages } });
    } catch (error: any) {
      res.status(error.message === "Plugin not found" ? 404 : 500).json({ success: false, error: error.message || "Failed to fetch ratings" });
    }
  }

  async getRatingSummary(req: Request, res: Response) {
    try {
      const data = await ratingsService.getRatingSummary(String(req.params.slug));
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(error.message === "Plugin not found" ? 404 : 500).json({ success: false, error: error.message || "Failed to fetch rating summary" });
    }
  }

  async submitRating(req: AuthRequest, res: Response) {
    try {
      const data = await ratingsService.submitRating(String(req.params.slug), req.user!.id, parseInt(req.body.score), req.body.comment);
      res.status(201).json({ success: true, data });
    } catch (error: any) {
      const status = error.message === "Plugin not found" ? 404 : (error.message.includes("between 1 and 5") ? 400 : 500);
      res.status(status).json({ success: false, error: error.message || "Failed to submit rating" });
    }
  }

  async deleteRating(req: AuthRequest, res: Response) {
    try {
      await ratingsService.deleteRating(String(req.params.slug), req.user!.id);
      res.json({ success: true, message: "Rating deleted" });
    } catch (error: any) {
      res.status(error.message === "Plugin not found" ? 404 : 500).json({ success: false, error: error.message || "Failed to delete rating" });
    }
  }

  async replyToRating(req: AuthRequest, res: Response) {
    try {
      const data = await ratingsService.replyToRating(String(req.params.slug), String(req.params.ratingId), req.body.reply, req.user!.id);
      res.json({ success: true, data });
    } catch (error: any) {
      console.error("Reply error:", error);
      const status = error.message === "Plugin not found" ? 404 : (error.message.includes("Only the plugin author") ? 403 : (error.message.includes("cannot be empty") ? 400 : 500));
      res.status(status).json({ success: false, error: error.message || "Failed to submit reply" });
    }
  }
}

export const ratingsController = new RatingsController();
