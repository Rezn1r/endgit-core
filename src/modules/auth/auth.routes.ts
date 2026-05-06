import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { authController } from "./auth.controller";

export const authRouter: Router = Router();

authRouter.post("/github", authController.authenticateGitHub);
authRouter.get("/me", requireAuth, authController.getMe);
