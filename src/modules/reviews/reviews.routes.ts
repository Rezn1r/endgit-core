import { Router } from "express";
import { requireAuth, requireReviewer } from "../../middleware/auth";
import { reviewsController } from "./reviews.controller";

export const reviewRouter: Router = Router();

reviewRouter.get("/admin/queue", requireAuth, requireReviewer, reviewsController.getQueue);
reviewRouter.get("/:slug/checks", reviewsController.getAutoChecks);
reviewRouter.get("/:slug", reviewsController.getReviews);
reviewRouter.post("/:slug", requireAuth, requireReviewer, reviewsController.submitReview);
