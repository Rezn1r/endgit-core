import { prisma } from "@endgit/database";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import crypto from "crypto";
import { requireSecret } from "../../lib/secrets";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  family: 4,
  tls: REDIS_URL.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
});
const buildQueue = new Queue("build-jobs", { connection });

const WEBHOOK_SECRET = requireSecret("ENDGIT_WEBHOOK_SECRET");

export class WebhooksService {
  verifySignature(payload: Buffer, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = "sha256=" + crypto.createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex");
    if (signature.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  async processGitHubPush(payload: any) {
    const repoUrl = payload.repository?.html_url;
    const ref = payload.ref || "";

    // Ignore tag pushes — only build branch commits
    if (ref.startsWith("refs/tags/")) {
      console.log(`[Webhook] 🏷️ Tag push detected (${ref}), skipping build`);
      return { message: `Ignored tag push: ${ref}`, queued: false };
    }

    const branch = ref.replace("refs/heads/", "") || "main";
    const commitHash = payload.after || payload.head_commit?.id;
    const commitMessage = payload.head_commit?.message || "";
    const pusher = payload.pusher?.name || "unknown";

    if (!repoUrl) throw new Error("Missing repository URL");

    const plugin = await prisma.plugin.findFirst({
      where: { repoUrl },
      select: { id: true, slug: true, status: true, repoUrl: true, authorId: true }
    });

    if (!plugin) {
      console.log(`[Webhook] ℹ️ No plugin linked to ${repoUrl}, skipping`);
      return { message: "No plugin linked to this repo", queued: false };
    }

    const author = await prisma.user.findUnique({
      where: { id: plugin.authorId },
      select: { id: true, weeklyBuildQuota: true, weeklyBuildCount: true, quotaResetAt: true }
    });

    if (author) {
      const now = new Date();
      let currentCount = author.weeklyBuildCount;

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
        throw new Error(`Weekly build quota exceeded (${author.weeklyBuildQuota} builds/week). Contact an admin to increase your quota.`);
      }

      await prisma.user.update({
        where: { id: author.id },
        data: { weeklyBuildCount: { increment: 1 } }
      });
    }

    console.log(`[Webhook] 🔨 Triggering build for ${plugin.slug} (${branch}@${commitHash?.slice(0, 7)}) by ${pusher}`);

    const buildNumber = await prisma.build.count({ where: { pluginId: plugin.id } }) + 1;

    const build = await prisma.build.create({
      data: {
        buildNumber, pluginId: plugin.id, status: "QUEUED", branch,
        commitHash: commitHash || null, commitMessage: commitMessage.slice(0, 200), triggerType: "WEBHOOK",
      }
    });

    await buildQueue.add("build-plugin", {
      pluginId: plugin.id, pluginSlug: plugin.slug, repoUrl: plugin.repoUrl,
      buildId: build.id, userId: plugin.authorId, commitHash: commitHash || null, branch, commitMessage,
    });

    return {
      message: `Build #${buildNumber} queued`, queued: true,
      data: { buildId: build.id, buildNumber, branch, commitHash: commitHash?.slice(0, 7) }
    };
  }
}

export const webhooksService = new WebhooksService();
