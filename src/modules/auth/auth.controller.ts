import { Request, Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { authService } from "./auth.service";

export class AuthController {
  async authenticateGitHub(req: Request, res: Response) {
    try {
      const { access_token, token_type, scope } = req.body;
      const data = await authService.authenticateWithGitHub(access_token, token_type, scope);
      res.json({ success: true, data });
    } catch (error: any) {
      console.error("Auth error:", error);
      res.status(error.message.includes("required") ? 400 : 500).json({
        success: false,
        error: error.message || "Authentication failed",
      });
    }
  }

  async getMe(req: AuthRequest, res: Response) {
    try {
      const user = await authService.getCurrentUser(req.user!.id);
      res.json({ success: true, data: user });
    } catch (error: any) {
      res.status(error.message === "User not found" ? 404 : 500).json({
        success: false,
        error: error.message || "Failed to get user info",
      });
    }
  }
}

export const authController = new AuthController();
