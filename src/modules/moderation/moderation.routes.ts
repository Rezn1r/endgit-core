import { Router } from "express";
import { requireAuth, requireAdmin } from "../../middleware/auth";
import { moderationController } from "./moderation.controller";

export const moderationRouter: Router = Router();

moderationRouter.post("/:slug/report", requireAuth, moderationController.reportPlugin);
moderationRouter.post("/:slug/rate", requireAuth, moderationController.ratePlugin);
moderationRouter.get("/:slug/ratings", moderationController.getRatings);
moderationRouter.patch("/trust/:userId", requireAuth, requireAdmin, moderationController.updateTrustLevel);
