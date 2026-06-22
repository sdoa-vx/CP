import "dotenv/config";
import http from "node:http";
import { handleProposals, handleLatestProposal } from "./routes/proposals";
import { handleDecision } from "./routes/decision";
import { handleHealth } from "./routes/health";
import { handleFederation } from "./routes/federation";
import dashboardRouter, { staticRouter } from "./routes/dashboard";
import { initWebSocket } from "./ws";
import { Router } from "./utils/Router";
import { logger } from "./utils/logger";
import { githubWebhook } from "./webhooks/webhooks";

const PORT = process.env.PORT || 8080;

const app = new Router();

// Auth Middleware wrapper
app.use("/dashboard", (req, res, next) => {
  const auth = req.headers.authorization;
  const adminCreds = (process.env.ADMIN_USER || "admin") + ":" + (process.env.ADMIN_PASS || "admin");
  const expected = "Basic " + Buffer.from(adminCreds).toString("base64");
  if (auth !== expected) {
    res.setHeader("WWW-Authenticate", 'Basic realm="SDOA Dashboard"');
    res.statusCode = 401;
    return res.end("Unauthorized");
  }
  if(next) next();
});
app.use("/public", (req, res, next) => {
  const auth = req.headers.authorization;
  const adminCreds = (process.env.ADMIN_USER || "admin") + ":" + (process.env.ADMIN_PASS || "admin");
  const expected = "Basic " + Buffer.from(adminCreds).toString("base64");
  if (auth !== expected) {
    res.setHeader("WWW-Authenticate", 'Basic realm="SDOA Dashboard"');
    res.statusCode = 401;
    return res.end("Unauthorized");
  }
  if(next) next();
});

// Mount modular routers
app.use("/dashboard", dashboardRouter);
app.use("/public", staticRouter);
app.post("/github/webhook", githubWebhook);

import { handleTelemetryReuse } from "./routes/telemetry";

// Legacy explicit routes
app.use("/", (req, res, next) => {
  if (req.url?.startsWith("/health") && req.method === "GET") return handleHealth(req, res);
  if (req.url?.startsWith("/federation/")) return handleFederation(req, res);
  if (req.url === "/fisp/v1/proposals" && req.method === "POST") return handleProposals(req, res);
  if (req.url === "/fisp/v1/proposals/latest" && req.method === "GET") return handleLatestProposal(req, res);
  if (req.url?.startsWith("/fisp/v1/proposals/") && req.method === "POST") return handleDecision(req, res);
  if (req.url === "/telemetry/reuse" && req.method === "POST") return handleTelemetryReuse(req, res);
  if (next) next();
});

const server = http.createServer((req, res) => {
  try {
    app.handle(req, res);
  } catch (err) {
    logger.error("[MCP] Unhandled error:", err);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

server.listen(PORT, () => {
  logger.info(`[MCP] Server listening on port ${PORT}`);
});

initWebSocket(server);

import { startOfflineSync } from "./workers/offlineSync";
startOfflineSync();

import { emit } from "./engine/events";
emit("engine:start", { port: Number(PORT), pid: process.pid });

