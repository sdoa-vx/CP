import { Hono } from "hono";
import type { Env } from "./lib/supabase";
import webhooks from "./github/webhooks";
import proposals from "./routes/proposals";
import portfolio from "./routes/portfolio";
import telemetry from "./routes/telemetry";
import canonicalLibrary from "./routes/canonicalLibrary";
import mcp from "./routes/mcp";

const app = new Hono<{ Bindings: Env }>();

// Heartbeat endpoint
app.get("/api/health", (c) => {
  return c.json({
    status: "healthy",
    engine: "SDOA Cloud Ingress",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// Mount routes
app.route("/api/github/webhooks", webhooks);
app.route("/api/proposals", proposals);
app.route("/api/portfolio", portfolio);
app.route("/api/telemetry", telemetry);
app.route("/api/canonical-library", canonicalLibrary);
app.route("/mcp", mcp);

// Default 404
app.notFound((c) => {
  return c.json(
    { ok: false, error: "Resource not found on SDOA Cloud Edge" },
    404
  );
});

// Global Error Handler
app.onError((err, c) => {
  console.error("Worker Global Error:", err);
  return c.json(
    { ok: false, error: err.message || "Internal Ingress Error" },
    500
  );
});

export default app;
