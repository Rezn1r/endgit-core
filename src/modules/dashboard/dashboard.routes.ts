import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { dashboardController } from "./dashboard.controller";

export const dashboardRouter: Router = Router();

dashboardRouter.get("/status", requireAuth, dashboardController.getStatus);
dashboardRouter.get("/plugins", requireAuth, dashboardController.getPlugins);
dashboardRouter.get("/stats", requireAuth, dashboardController.getStats);
