import { Router } from "express";
import { optionalAuth, requireAuth } from "../../middleware/auth";
import { buildRateLimit } from "../../middleware/rateLimit";
import { pluginsController } from "./plugins.controller";

export const pluginsRouter: Router = Router();

pluginsRouter.get("/", optionalAuth, pluginsController.listPlugins);
pluginsRouter.get("/trending", pluginsController.getTrending);
pluginsRouter.get("/latest", pluginsController.getLatest);
pluginsRouter.get("/:slug/analytics", pluginsController.getAnalytics);
pluginsRouter.get("/:slug/dependencies", pluginsController.getDependencies);
pluginsRouter.get("/:slug", optionalAuth, pluginsController.getBySlug);

pluginsRouter.post("/", requireAuth, pluginsController.createPlugin);
pluginsRouter.patch("/:slug", requireAuth, pluginsController.updatePlugin);
pluginsRouter.delete("/:slug", requireAuth, pluginsController.deletePlugin);
pluginsRouter.post("/:slug/build", requireAuth, buildRateLimit, pluginsController.triggerBuild);
