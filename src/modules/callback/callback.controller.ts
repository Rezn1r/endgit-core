import { Request, Response } from "express";
import { callbackService } from "./callback.service";

const CALLBACK_TOKEN = process.env.ENDGIT_CALLBACK_TOKEN || "endgit-callback-secret";

export class CallbackController {
  async processArtifactCallback(req: Request, res: Response) {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (token !== CALLBACK_TOKEN) {
        return res.status(401).json({ success: false, error: "Unauthorized callback" });
      }

      const platform = (req.body.platform as string) || "unknown";
      const status = (req.body.status as string) || "FAILED";
      const error = req.body.error as string | undefined;

      const result = await callbackService.processCallback(String(req.params.id), platform, status, error, req.file);
      res.json({ success: true, message: result.message });
    } catch (error: any) {
      console.error("[Callback] Error:", error);
      res.status(error.message === "Build not found" ? 404 : (error.message === "No artifact file provided" ? 400 : 500))
         .json({ success: false, error: error.message || "Callback processing failed" });
    }
  }
}

export const callbackController = new CallbackController();
