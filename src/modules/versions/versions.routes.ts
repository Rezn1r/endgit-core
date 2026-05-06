import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { versionsController } from "./versions.controller";

export const versionsRouter: Router = Router();

versionsRouter.get("/:slug", versionsController.getVersions);
versionsRouter.post("/:slug", requireAuth, versionsController.createVersion);
versionsRouter.delete("/:slug/:version", requireAuth, versionsController.deleteVersion);
