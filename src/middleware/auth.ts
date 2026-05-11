// ─────────────────────────────────────────────────────────
// Auth Middleware — JWT/Session verification
// ─────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "@endgit/database";

export interface AuthRequest extends Request {
    user?: {
        id: string;
        username: string;
        trustLevel: string;
    };
}

const JWT_SECRET = process.env.NEXTAUTH_SECRET || "dev-secret";

/**
 * Required authentication — rejects with 401 if no valid token
 */
export function requireAuth(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
) {
    const token = extractToken(req);

    if (!token) {
        return res.status(401).json({
            success: false,
            error: "Authentication required",
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.user = {
            id: decoded.sub || decoded.id,
            username: decoded.username,
            trustLevel: decoded.trustLevel || "NEW",
        };
        next();
    } catch {
        return res.status(401).json({
            success: false,
            error: "Invalid or expired token",
        });
    }
}

/**
 * Optional authentication — attaches user if token present, continues otherwise
 */
export function optionalAuth(
    req: AuthRequest,
    _res: Response,
    next: NextFunction,
) {
    const token = extractToken(req);

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET) as any;
            req.user = {
                id: decoded.sub || decoded.id,
                username: decoded.username,
                trustLevel: decoded.trustLevel || "NEW",
            };
        } catch {
            // Invalid token — continue without user
        }
    }

    next();
}

/**
 * Admin-only middleware — requires ADMIN trust level
 */
export function requireAdmin(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: "Authentication required",
        });
    }

    if (req.user.trustLevel !== "ADMIN") {
        return res.status(403).json({
            success: false,
            error: "Admin access required",
        });
    }

    next();
}

/**
 * Reviewer-only middleware — requires TRUSTED or ADMIN trust level
 */
export function requireReviewer(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: "Authentication required",
        });
    }

    if (req.user.trustLevel !== "ADMIN" && req.user.trustLevel !== "TRUSTED") {
        return res.status(403).json({
            success: false,
            error: "Reviewer access required",
        });
    }

    next();
}

/**
 * Generate JWT token for a user
 */
export function generateToken(user: {
    id: string;
    username: string;
    trustLevel: string;
}): string {
    return jwt.sign(
        {
            sub: user.id,
            username: user.username,
            trustLevel: user.trustLevel,
        },
        JWT_SECRET,
        { expiresIn: "1h" },
    );
}

function extractToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
        return authHeader.slice(7);
    }
    return null;
}
