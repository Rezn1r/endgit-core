import { Request, Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { reviewsService } from "./reviews.service";

export class ReviewsController {
  async getAutoChecks(req: Request, res: Response) {
    try {
      const data = await reviewsService.getAutoChecks(String(req.params.slug));
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(error.message === "Plugin not found" ? 404 : 500).json({ success: false, error: error.message || "Failed to get checks" });
    }
  }

  async getReviews(req: Request, res: Response) {
    try {
      const data = await reviewsService.getReviews(String(req.params.slug));
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(error.message === "Plugin not found" ? 404 : 500).json({ success: false, error: error.message || "Failed to get reviews" });
    }
  }

  async submitReview(req: AuthRequest, res: Response) {
    try {
      const data = await reviewsService.submitReview(String(req.params.slug), req.user!.id, req.body);
      res.status(201).json({ success: true, data });
    } catch (error: any) {
      res.status(error.message === "Plugin not found" ? 404 : (error.message.includes("required") ? 400 : 500)).json({ success: false, error: error.message || "Failed to submit review" });
    }
  }

  async getQueue(req: AuthRequest, res: Response) {
    try {
      const data = await reviewsService.getReviewQueue();
      res.json({ success: true, data });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Failed to get review queue" });
    }
  }
}

export const reviewsController = new ReviewsController();
