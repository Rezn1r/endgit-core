import { Router } from "express";
import multer from "multer";
import { callbackController } from "./callback.controller";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB max

export const callbackRouter: Router = Router();

callbackRouter.post("/:id/artifact-callback", upload.single("artifact"), callbackController.processArtifactCallback);
