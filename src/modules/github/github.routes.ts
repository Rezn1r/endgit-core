import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { githubController } from "./github.controller";

export const githubRouter: Router = Router();

githubRouter.get("/repos", requireAuth, githubController.getRepos);
githubRouter.post("/repos/:repoId/enable", requireAuth, githubController.enableCI);
githubRouter.post("/repos/:pluginId/disable", requireAuth, githubController.disableCI);
githubRouter.get("/repo-readme", requireAuth, githubController.getRepoReadme);
githubRouter.get("/repo-license", requireAuth, githubController.getRepoLicense);
