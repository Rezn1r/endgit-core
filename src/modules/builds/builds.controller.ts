import { Request, Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { buildsService } from "./builds.service";

export class BuildsController {
  async getRecentBuilds(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const status = req.query.status as string;
      const branch = req.query.branch as string;

      const { builds, total, totalPages } = await buildsService.getRecentBuilds(page, limit, status, branch);
      res.json({ success: true, data: builds, pagination: { page, limit, total, totalPages } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Failed to fetch builds" });
    }
  }

  async getMyBuilds(req: AuthRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

      const builds = await buildsService.getMyBuilds(req.user!.id, page, limit);
      res.json({ success: true, data: builds });
    } catch (error: any) {
      res.status(500).json({ success: false, error: "Failed to fetch builds" });
    }
  }

  async getPluginBuilds(req: AuthRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

      const { plugin, builds, total, totalPages } = await buildsService.getPluginBuilds(String(req.params.slug), page, limit, req.user?.id);
      res.json({ success: true, data: { plugin, builds }, pagination: { page, limit, total, totalPages } });
    } catch (error: any) {
      res.status(error.message === "Plugin not found" ? 404 : 500).json({ success: false, error: error.message || "Failed to fetch builds" });
    }
  }

  async getBuildDetail(req: Request, res: Response) {
    try {
      const build = await buildsService.getBuildDetail(String(req.params.id));
      res.json({ success: true, data: build });
    } catch (error: any) {
      res.status(error.message === "Build not found" ? 404 : 500).json({ success: false, error: error.message || "Failed to fetch build" });
    }
  }

  async streamBuild(req: Request, res: Response) {
    try {
      const buildId = String(req.params.id);
      
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      let lastLogLength = 0;
      let finished = false;

      const sendUpdate = async () => {
        try {
          const build = await buildsService.getBuildStreamData(buildId);

          if (!build) {
            res.write(`data: ${JSON.stringify({ type: "error", message: "Build not found" })}\n\n`);
            res.end();
            return;
          }

          const currentLog = build.logs || "";
          if (currentLog.length > lastLogLength) {
            const newContent = currentLog.slice(lastLogLength);
            lastLogLength = currentLog.length;
            res.write(`data: ${JSON.stringify({ type: "log", content: newContent })}\n\n`);
          }

          if (build.status === "SUCCESS" || build.status === "FAILED" || build.status === "CANCELLED") {
            res.write(`data: ${JSON.stringify({ type: "finish", status: build.status, safeScore: build.safeScore, duration: build.duration })}\n\n`);
            finished = true;
            res.end();
          }
        } catch (err: any) {
          res.write(`data: ${JSON.stringify({ type: "error", message: "Stream error" })}\n\n`);
          finished = true;
          res.end();
        }
      };

      const interval = setInterval(async () => {
        if (finished) { clearInterval(interval); return; }
        await sendUpdate();
      }, 2000);

      await sendUpdate();

      req.on("close", () => {
        clearInterval(interval);
        finished = true;
      });

    } catch (error: any) {
      console.error("Build stream error:", error);
      res.status(500).json({ success: false, error: "Failed to start stream" });
    }
  }
}

export const buildsController = new BuildsController();
