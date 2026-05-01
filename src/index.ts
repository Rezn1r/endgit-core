// ─────────────────────────────────────────────────────────
// EndGit API Server — endgit-core
// CI/CD + Plugin Marketplace for Endstone
// ─────────────────────────────────────────────────────────

import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { pluginRouter } from "./routes/plugins";
import { versionsRouter } from "./routes/versions";
import { downloadRouter } from "./routes/download";
import { authRouter } from "./routes/auth";
import { reviewRouter } from "./routes/reviews";
import { moderationRouter } from "./routes/moderation";
import { dashboardRouter } from "./routes/dashboard";
import { buildRouter } from "./routes/builds";
import { githubRouter } from "./routes/github";
import { adminRouter } from "./routes/admin";
import { ratingRouter } from "./routes/ratings";
import { submitRouter } from "./routes/submit";
import { webhookRouter } from "./routes/webhooks";
import { callbackRouter } from "./routes/callback";

const app: express.Express = express();
const PORT = process.env.PORT || process.env.API_PORT || 4000;

// ── Middleware ────────────────────────────────────────────

app.use(helmet());
app.use(
  cors({
    origin: [
      process.env.NEXTAUTH_URL || "http://localhost:3000",
      "http://localhost:3000" // Always allow localhost for local development
    ],
    credentials: true,
  })
);
app.use(morgan("dev"));
app.use(express.json({ 
  limit: "1mb",
  verify: (req: any, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true }));

// ── Health Check ─────────────────────────────────────────

app.get("/api/v1/health", (_req, res) => {
  res.json({
    success: true,
    data: {
      status: "ok",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
    },
  });
});

// ── Routes ───────────────────────────────────────────────

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/plugins", pluginRouter);
app.use("/api/v1/versions", versionsRouter);
app.use("/api/v1/download", downloadRouter);
app.use("/api/v1/reviews", reviewRouter);
app.use("/api/v1/moderation", moderationRouter);
app.use("/api/v1/dashboard", dashboardRouter);
app.use("/api/v1/builds", buildRouter);
app.use("/api/v1/github", githubRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/ratings", ratingRouter);
app.use("/api/v1/submit", submitRouter);
app.use("/api/v1/webhooks", webhookRouter);
app.use("/api/v1/builds", callbackRouter); // GitHub Actions artifact callbacks

// ── Error Handler ────────────────────────────────────────

app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("❌ Error:", err.message);
    res.status(err.status || 500).json({
      success: false,
      error: err.message || "Internal Server Error",
    });
  }
);

// ── 404 Handler ──────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: "Not Found",
  });
});

// ── Start ────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════════╗
  ║                                                   ║
  ║   🚀 EndGit API Server                           ║
  ║   Running on http://localhost:${PORT}              ║
  ║                                                   ║
  ╚═══════════════════════════════════════════════════╝
  `);
});

export default app;
