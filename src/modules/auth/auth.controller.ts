import { Request, Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { authService } from "./auth.service";
import { deviceService } from "./device.service";
import { refreshService } from "./refresh.service";

export class AuthController {
    async authenticateGitHub(req: Request, res: Response) {
        try {
            const { access_token, token_type, scope } = req.body;
            const data = await authService.authenticateWithGitHub(
                access_token,
                token_type,
                scope,
            );
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

    // ── Device Authorization Flow (RFC 8628) ─────────────────────────

    async requestDeviceCode(_req: Request, res: Response) {
        try {
            const data = await deviceService.createDeviceCode();
            res.json({ success: true, data });
        } catch (error: any) {
            console.error("Device code error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to create device code",
            });
        }
    }

    async authorizeDevice(req: AuthRequest, res: Response) {
        try {
            const { user_code } = req.body;
            if (!user_code || typeof user_code !== "string") {
                return res
                    .status(400)
                    .json({ success: false, error: "user_code is required" });
            }
            await deviceService.authorizeDevice(user_code, req.user!.id);
            res.json({ success: true });
        } catch (error: any) {
            const status =
                error.message.includes("Invalid") ||
                error.message.includes("expired")
                    ? 400
                    : 500;
            res.status(status).json({
                success: false,
                error: error.message || "Authorization failed",
            });
        }
    }

    async pollDeviceToken(req: Request, res: Response) {
        try {
            const { device_code } = req.body;
            if (!device_code || typeof device_code !== "string") {
                return res
                    .status(400)
                    .json({ success: false, error: "device_code is required" });
            }

            const result = await deviceService.pollDeviceToken(device_code);

            if ("error" in result) {
                return res
                    .status(428)
                    .json({ success: false, error: result.error });
            }

            res.json({ success: true, data: result });
        } catch (error: any) {
            console.error("Device poll error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to poll device token",
            });
        }
    }

    // ── Token Refresh ────────────────────────────────────────────────────────────

    async refreshToken(req: Request, res: Response) {
        try {
            const { refresh_token } = req.body;
            if (!refresh_token || typeof refresh_token !== "string") {
                return res
                    .status(400)
                    .json({
                        success: false,
                        error: "refresh_token is required",
                    });
            }

            const result =
                await refreshService.rotateRefreshToken(refresh_token);
            if (!result) {
                return res
                    .status(401)
                    .json({
                        success: false,
                        error: "Invalid or expired refresh token",
                    });
            }

            res.json({ success: true, data: result });
        } catch (error: any) {
            console.error("Refresh token error:", error);
            res.status(500).json({
                success: false,
                error: "Failed to refresh token",
            });
        }
    }
}

export const authController = new AuthController();
