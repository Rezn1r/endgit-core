import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { submitController } from "./submit.controller";
import { uploadRateLimit } from "../../middleware/rateLimit";

export const submitRouter: Router = Router();

submitRouter.post("/:buildId", requireAuth, uploadRateLimit, submitController.submitBuild);
submitRouter.get("/status/:pluginSlug", submitController.getStatus);
