import { Request, Response } from "express";
import { callbackService } from "./callback.service";
import fs from "fs";

export class CallbackController {
  async processArtifactCallback(req: Request, res: Response) {
    try {
      const platform = (req.body.platform as string) || "unknown";
      const status = (req.body.status as string) || "FAILED";
      const error = req.body.error as string | undefined;

      const result = await callbackService.processCallback(String(req.params.id), platform, status, error, req.file);
      res.json({ success: true, message: result.message });
    } catch (error: any) {
      console.error("[Callback] Error:", error);
      const badRequest = error.message === "No artifact file provided" ||
        error.message === "Invalid callback platform" ||
        error.message === "Invalid callback status";
      res.status(error.message === "Build not found" ? 404 : (badRequest ? 400 : 500))
         .json({ success: false, error: error.message || "Callback processing failed" });
    } finally {
      if (req.file?.path) {
        await fs.promises.unlink(req.file.path).catch(() => {});
      }
    }
  }
}

export const callbackController = new CallbackController();
