import { Request, Response } from "express";
import { webhooksService } from "./webhooks.service";

export class WebhooksController {
  async handleGitHubWebhook(req: Request, res: Response) {
    try {
      const event = req.headers["x-github-event"] as string;
      const signature = req.headers["x-hub-signature-256"] as string;
      const deliveryId = req.headers["x-github-delivery"] as string;

      const rawBody = (req as any).rawBody;
      if (!rawBody || !webhooksService.verifySignature(rawBody, signature)) {
        console.warn(`[Webhook] ⚠️ Invalid signature for delivery ${deliveryId}`);
        return res.status(401).json({ success: false, error: "Invalid signature" });
      }

      if (event === "ping") {
        console.log(`[Webhook] 🏓 Ping received from ${req.body.repository?.full_name}`);
        return res.json({ success: true, message: "pong" });
      }

      if (event !== "push") {
        return res.json({ success: true, message: `Ignored event: ${event}` });
      }

      const result = await webhooksService.processGitHubPush(req.body);
      
      if (!result.queued) {
        return res.json({ success: true, message: result.message });
      }

      res.json({ success: true, message: result.message, data: result.data });

    } catch (error: any) {
      console.error("[Webhook] ❌ Error:", error.message);
      res.status(error.message.includes("quota") ? 429 : 500).json({ success: false, error: error.message || "Webhook processing failed" });
    }
  }
}

export const webhooksController = new WebhooksController();
