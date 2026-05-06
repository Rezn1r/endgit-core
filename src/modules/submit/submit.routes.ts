import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { submitController } from "./submit.controller";

export const submitRouter: Router = Router();

submitRouter.post("/:buildId", requireAuth, submitController.submitBuild);
submitRouter.get("/status/:pluginSlug", submitController.getStatus);
