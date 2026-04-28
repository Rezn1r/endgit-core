// ─────────────────────────────────────────────────────────
// Auth Routes — GitHub App OAuth flow
// ─────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { prisma } from "@endgit/database";
import { generateToken, requireAuth, AuthRequest } from "../middleware/auth";

export const authRouter: Router = Router();

/**
 * POST /api/v1/auth/github — Exchange GitHub code for EndGit JWT
 * Called by the frontend after GitHub OAuth redirect
 */
authRouter.post("/github", async (req: Request, res: Response) => {
  try {
    const { access_token, token_type, scope } = req.body;

    if (!access_token) {
      return res.status(400).json({
        success: false,
        error: "GitHub access token is required",
      });
    }

    // Get GitHub user info
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    const githubUser: any = await userResponse.json();

    // Upsert user in database
    const user = await prisma.user.upsert({
      where: { githubId: String(githubUser.id) },
      update: {
        username: githubUser.login,
        displayName: githubUser.name,
        email: githubUser.email,
        avatarUrl: githubUser.avatar_url,
        bio: githubUser.bio,
      },
      create: {
        githubId: String(githubUser.id),
        username: githubUser.login,
        displayName: githubUser.name,
        email: githubUser.email,
        avatarUrl: githubUser.avatar_url,
        bio: githubUser.bio,
      },
    });

    // Store account for NextAuth compatibility
    await prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: "github",
          providerAccountId: String(githubUser.id),
        },
      },
      update: {
        access_token: access_token,
        token_type: token_type || "bearer",
        scope: scope || "",
      },
      create: {
        userId: user.id,
        type: "oauth",
        provider: "github",
        providerAccountId: String(githubUser.id),
        access_token: access_token,
        token_type: token_type || "bearer",
        scope: scope || "",
      },
    });

    // Generate JWT
    const token = generateToken({
      id: user.id,
      username: user.username,
      trustLevel: user.trustLevel,
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          trustLevel: user.trustLevel,
        },
      },
    });
  } catch (error: any) {
    console.error("Auth error:", error);
    res.status(500).json({
      success: false,
      error: "Authentication failed",
    });
  }
});

/**
 * GET /api/v1/auth/me — Get current user info
 */
authRouter.get(
  "/me",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: {
          id: true,
          username: true,
          displayName: true,
          email: true,
          avatarUrl: true,
          bio: true,
          trustLevel: true,
          createdAt: true,
        },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      res.json({ success: true, data: user });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: "Failed to get user info",
      });
    }
  }
);
