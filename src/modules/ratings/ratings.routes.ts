import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { ratingsController } from "./ratings.controller";

export const ratingRouter: Router = Router();

ratingRouter.get("/:slug", ratingsController.getRatings);
ratingRouter.get("/:slug/summary", ratingsController.getRatingSummary);
ratingRouter.post("/:slug", requireAuth, ratingsController.submitRating);
ratingRouter.delete("/:slug", requireAuth, ratingsController.deleteRating);
ratingRouter.post("/:slug/:ratingId/reply", requireAuth, ratingsController.replyToRating);
