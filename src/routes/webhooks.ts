// ─────────────────────────────────────────────────────────
// GitHub Webhook Receiver — Auto-build on push
// ─────────────────────────────────────────────────────────

import { Router, Request, Response } from "express";
import { prisma } from "@endgit/database";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import crypto from "crypto";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const buildQueue = new Queue("build-jobs", { connection });

const WEBHOOK_SECRET = process.env.ENDGIT_WEBHOOK_SECRET || "endgit-webhook-secret";

export const webhookRouter: Router = Router();

/**
 * Verify GitHub webhook signature (X-Hub-Signature-256)
 */
function verifySignature(payload: Buffer, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = "sha256=" + crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/**
 * POST /api/v1/webhooks/github — Receive GitHub push events
 *
 * Flow:
 *   GitHub push → POST here → find plugin by repoUrl → queue build job
 */
webhookRouter.post("/github", async (req: Request, res: Response) => {
  try {
    const event = req.headers["x-github-event"] as string;
    const signature = req.headers["x-hub-signature-256"] as string;
    const deliveryId = req.headers["x-github-delivery"] as string;

    // Verify webhook signature
    const rawBody = (req as any).rawBody;
    if (!rawBody || !verifySignature(rawBody, signature)) {
      console.warn(`[Webhook] ⚠️ Invalid signature for delivery ${deliveryId}`);
      return res.status(401).json({ success: false, error: "Invalid signature" });
    }

    // Handle ping event (sent when webhook is first created)
    if (event === "ping") {
      console.log(`[Webhook] 🏓 Ping received from ${req.body.repository?.full_name}`);
      return res.json({ success: true, message: "pong" });
    }

    // Only process push events
    if (event !== "push") {
      return res.json({ success: true, message: `Ignored event: ${event}` });
    }

    const payload = req.body;
    const repoUrl = payload.repository?.html_url;
    const branch = payload.ref?.replace("refs/heads/", "") || "main";
    const commitHash = payload.after || payload.head_commit?.id;
    const commitMessage = payload.head_commit?.message || "";
    const pusher = payload.pusher?.name || "unknown";

    if (!repoUrl) {
      return res.status(400).json({ success: false, error: "Missing repository URL" });
    }

    // Find plugin linked to this repo
    const plugin = await prisma.plugin.findFirst({
      where: { repoUrl },
      select: { id: true, slug: true, status: true, repoUrl: true, authorId: true }
    });

    if (!plugin) {
      console.log(`[Webhook] ℹ️ No plugin linked to ${repoUrl}, skipping`);
      return res.json({ success: true, message: "No plugin linked to this repo" });
    }

    const activeBuild = await prisma.build.findFirst({
      where: { pluginId: plugin.id, status: { in: ["QUEUED", "RUNNING"] } }
    });
    if (activeBuild) {
      console.log(`[Webhook] ⏳ Plugin ${plugin.slug} is already building, skipping`);
      return res.json({ success: true, message: "Already building" });
    }

    // ── Weekly Build Quota Check ──
    const author = await prisma.user.findUnique({
      where: { id: plugin.authorId },
      select: { id: true, weeklyBuildQuota: true, weeklyBuildCount: true, quotaResetAt: true }
    });

    if (author) {
      const now = new Date();
      let currentCount = author.weeklyBuildCount;

      // Reset counter if 7 days have passed
      if (now >= author.quotaResetAt) {
        const nextReset = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        await prisma.user.update({
          where: { id: author.id },
          data: { weeklyBuildCount: 0, quotaResetAt: nextReset }
        });
        currentCount = 0;
      }

      if (currentCount >= author.weeklyBuildQuota) {
        console.log(`[Webhook] 🚫 User ${author.id} exceeded weekly build quota (${currentCount}/${author.weeklyBuildQuota})`);
        return res.status(429).json({
          success: false,
          error: `Weekly build quota exceeded (${author.weeklyBuildQuota} builds/week). Contact an admin to increase your quota.`
        });
      }

      // Increment build count
      await prisma.user.update({
        where: { id: author.id },
        data: { weeklyBuildCount: { increment: 1 } }
      });
    }

    console.log(`[Webhook] 🔨 Triggering build for ${plugin.slug} (${branch}@${commitHash?.slice(0, 7)}) by ${pusher}`);

    // Check for .endgit.yml config — if branch filter is set, respect it
    // (Worker will parse the config from the repo during build)

    // Create build record
    const buildNumber = await prisma.build.count({ where: { pluginId: plugin.id } }) + 1;

    const build = await prisma.build.create({
      data: {
        buildNumber,
        pluginId: plugin.id,
        status: "QUEUED",
        branch,
        commitHash: commitHash || null,
        commitMessage: commitMessage.slice(0, 200),
        triggerType: "WEBHOOK",
      }
    });

    // Queue the build job
    await buildQueue.add("build-plugin", {
      pluginId: plugin.id,
      pluginSlug: plugin.slug,
      repoUrl: plugin.repoUrl,
      buildId: build.id,
      userId: plugin.authorId,
      commitHash: commitHash || null,
      branch,
      commitMessage,
    });

    // Plugin status is no longer mutated here to preserve marketplace lifecycle

    res.json({
      success: true,
      message: `Build #${buildNumber} queued`,
      data: { buildId: build.id, buildNumber, branch, commitHash: commitHash?.slice(0, 7) }
    });

  } catch (error: any) {
    console.error("[Webhook] ❌ Error:", error.message);
    res.status(500).json({ success: false, error: "Webhook processing failed" });
  }
});
