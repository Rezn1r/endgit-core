import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { buildsController } from "./builds.controller";

export const buildRouter: Router = Router();

buildRouter.get("/recent", buildsController.getRecentBuilds);
buildRouter.get("/me", requireAuth, buildsController.getMyBuilds);
buildRouter.get("/plugin/:slug", buildsController.getPluginBuilds);
buildRouter.get("/:id", buildsController.getBuildDetail);
buildRouter.get("/:id/stream", buildsController.streamBuild);
