import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { versionsController } from "./versions.controller";
import { uploadRateLimit } from "../../middleware/rateLimit";

export const versionsRouter: Router = Router();

versionsRouter.get("/:slug", versionsController.getVersions);
versionsRouter.post("/:slug", requireAuth, uploadRateLimit, versionsController.createVersion);
versionsRouter.delete("/:slug/:version", requireAuth, versionsController.deleteVersion);
