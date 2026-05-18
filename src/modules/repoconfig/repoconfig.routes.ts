// ─────────────────────────────────────────────────────────
// EndGit Repo Config — Routes
// ─────────────────────────────────────────────────────────

import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { repoconfigController } from "./repoconfig.controller";

export const repoconfigRouter: Router = Router();

repoconfigRouter.get("/:pluginSlug/config", requireAuth, repoconfigController.getConfig);
