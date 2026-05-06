import { Request, Response } from "express";
import { downloadService } from "./download.service";

export class DownloadController {
  async downloadFile(req: Request, res: Response) {
    try {
      const { file, fileName } = await downloadService.downloadFileByKey(String(req.params.key));

      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("Content-Length", file.length.toString());
      res.send(file);
    } catch (error: any) {
      console.error("Download file error:", error);
      res.status(error.message === "File not found" ? 404 : 500).json({ success: false, error: error.message || "Download failed" });
    }
  }

  async downloadVersion(req: Request, res: Response) {
    try {
      const { file, fileName, fileHash } = await downloadService.downloadPluginVersion(
        String(req.params.slug),
        String(req.params.version),
        req.query.platform as string
      );

      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("Content-Length", file.length.toString());
      res.setHeader("X-File-Hash", fileHash);
      res.send(file);
    } catch (error: any) {
      console.error("Download error:", error);
      const status = error.message.includes("not found") ? 404 : (error.message.includes("required") ? 400 : 500);
      res.status(status).json({ success: false, error: error.message || "Download failed" });
    }
  }
}

export const downloadController = new DownloadController();
