import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { requireSecret } from "../lib/secrets";

const CALLBACK_TOKEN = requireSecret("ENDGIT_CALLBACK_TOKEN");

export function requireCallbackAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
  if (!timingSafeEqual(token, CALLBACK_TOKEN)) {
    return res.status(401).json({ success: false, error: "Unauthorized callback" });
  }

  next();
}

function timingSafeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
