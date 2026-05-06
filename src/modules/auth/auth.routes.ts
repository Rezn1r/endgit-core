import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { authController } from "./auth.controller";
import { authRateLimit } from "../../middleware/rateLimit";

export const authRouter: Router = Router();

authRouter.post("/github", authRateLimit, authController.authenticateGitHub);
authRouter.get("/me", requireAuth, authController.getMe);
