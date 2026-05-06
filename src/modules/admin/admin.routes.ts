import { Router } from "express";
import { requireAuth, requireAdmin } from "../../middleware/auth";
import { adminController } from "./admin.controller";

export const adminRouter: Router = Router();

adminRouter.get("/users", requireAuth, requireAdmin, adminController.getUsers);
adminRouter.patch("/users/:id/trust", requireAuth, requireAdmin, adminController.updateUserTrustLevel);
adminRouter.patch("/users/:id/quota", requireAuth, requireAdmin, adminController.updateUserQuota);
adminRouter.get("/stats", requireAuth, requireAdmin, adminController.getStats);
adminRouter.get("/plugins", requireAuth, requireAdmin, adminController.getPlugins);
adminRouter.patch("/plugins/:id/status", requireAuth, requireAdmin, adminController.updatePluginStatus);
adminRouter.patch("/versions/:id/status", requireAuth, requireAdmin, adminController.updateVersionStatus);
