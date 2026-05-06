import { Router } from "express";
import { downloadController } from "./download.controller";

export const downloadRouter: Router = Router();

downloadRouter.get("/file/:key(*)", downloadController.downloadFile);
downloadRouter.get("/:slug/:version", downloadController.downloadVersion);
