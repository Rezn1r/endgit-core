import { Router } from "express";
import multer from "multer";
import { callbackController } from "./callback.controller";
import { uploadRateLimit } from "../../middleware/rateLimit";
import os from "os";

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB max

export const callbackRouter: Router = Router();

callbackRouter.post("/:id/artifact-callback", uploadRateLimit, upload.single("artifact"), callbackController.processArtifactCallback);
