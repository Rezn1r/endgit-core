// ─────────────────────────────────────────────────────────
// Admin Routes — User management, Review queue, System stats
// ─────────────────────────────────────────────────────────

import { Router, Response } from "express";
import { prisma } from "@endgit/database";
import { requireAuth, requireAdmin, AuthRequest } from "../middleware/auth";

export const adminRouter: Router = Router();

/**
 * GET /api/v1/admin/users — List all users (paginated)
 */
adminRouter.get("/users", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(((req.query.page as any as string))) || 1;
    const limit = Math.min(parseInt(((req.query.limit as any as string))) || 20, 50);
    const skip = (page - 1) * limit;
    const search = ((req.query.search as any as string));

    const where: any = {};
    if (search) {
      where.OR = [
        { username: { contains: search, mode: "insensitive" } },
        { displayName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true, username: true, displayName: true, email: true,
          avatarUrl: true, trustLevel: true, createdAt: true,
          _count: { select: { plugins: true, reviews: true, ratings: true } }
        }
      }),
      prisma.user.count({ where })
    ]);

    res.json({ success: true, data: users, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to fetch users" });
  }
});

/**
 * PATCH /api/v1/admin/users/:id/trust — Change user trust level
 */
adminRouter.patch("/users/:id/trust", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { trustLevel } = req.body;
    if (!["NEW", "TRUSTED", "FLAGGED", "ADMIN"].includes(trustLevel)) {
      return res.status(400).json({ success: false, error: "Invalid trust level" });
    }

    const user = await prisma.user.update({
      where: { id: String(req.params.id) },
      data: { trustLevel },
      select: { id: true, username: true, trustLevel: true }
    });

    res.json({ success: true, data: user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to update trust level" });
  }
});

/**
 * GET /api/v1/admin/stats — System-wide statistics
 */
adminRouter.get("/stats", requireAuth, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const [users, plugins, builds, pendingReviews] = await Promise.all([
      prisma.user.count(),
      prisma.plugin.count(),
      prisma.build.count(),
      prisma.plugin.count({ where: { status: "PENDING_REVIEW" } }),
    ]);

    res.json({
      success: true,
      data: { users, plugins, builds, pendingReviews }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to fetch stats" });
  }
});

/**
 * GET /api/v1/admin/plugins — List all plugins for admin management
 */
adminRouter.get("/plugins", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(((req.query.page as any as string))) || 1;
    const limit = Math.min(parseInt(((req.query.limit as any as string))) || 20, 50);
    const skip = (page - 1) * limit;
    const search = ((req.query.search as any as string));
    const status = ((req.query.status as any as string));

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { displayName: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
      ];
    }
    if (status) {
      where.status = status;
    }

    const [plugins, total] = await Promise.all([
      prisma.plugin.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          author: { select: { username: true, displayName: true } }
        }
      }),
      prisma.plugin.count({ where })
    ]);

    res.json({ success: true, data: plugins, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to fetch plugins" });
  }
});

/**
 * PATCH /api/v1/admin/plugins/:id/status — Change plugin status
 */
adminRouter.patch("/plugins/:id/status", requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "SUSPENDED", "FLAGGED"].includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid plugin status" });
    }

    const plugin = await prisma.plugin.update({
      where: { id: String(req.params.id) },
      data: { status },
      select: { id: true, slug: true, status: true, displayName: true }
    });

    res.json({ success: true, data: plugin });
  } catch (error: any) {
    res.status(500).json({ success: false, error: "Failed to update plugin status" });
  }
});
