import { Router } from "express";
import { webhooksController } from "./webhooks.controller";

export const webhookRouter: Router = Router();

webhookRouter.post("/github", webhooksController.handleGitHubWebhook);
