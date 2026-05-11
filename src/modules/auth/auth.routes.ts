import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { authController } from "./auth.controller";
import { authRateLimit } from "../../middleware/rateLimit";

export const authRouter: Router = Router();

authRouter.post("/github", authRateLimit, authController.authenticateGitHub);
authRouter.get("/me", requireAuth, authController.getMe);

// ── Device Authorization Flow (RFC 8628) ─────────────────────────────────────
authRouter.post("/device", authRateLimit, authController.requestDeviceCode);
authRouter.post("/device/authorize", requireAuth, authController.authorizeDevice);
authRouter.post("/device/token", authController.pollDeviceToken);
