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


const PORT = process.env.PORT || 8080;

const app = new Router();

// Auth Middleware wrapper
app.use("/dashboard", (req, res, next) => {
  const isLocal = req.socket.remoteAddress === "127.0.0.1" || req.socket.remoteAddress === "::1" || req.socket.remoteAddress === "::ffff:127.0.0.1";
  if (isLocal) {
    if (next) return next();
    return;
  }
  if (req.method === "GET" && !req.url?.startsWith("/api/")) {
    if (next) return next();
    return;
  }
  const authHeader = req.headers.authorization;
  const urlParams = new URL(req.url || "/", "http://localhost").searchParams;
  const tokenQuery = urlParams.get("token");
  const auth = authHeader || (tokenQuery ? `Basic ${tokenQuery}` : null);

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
  const isLocal = req.socket.remoteAddress === "127.0.0.1" || req.socket.remoteAddress === "::1" || req.socket.remoteAddress === "::ffff:127.0.0.1";
  if (isLocal) {
    if (next) return next();
    return;
  }
  if (req.method === "GET") {
    if (next) return next();
    return;
  }
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

import configRouter from "./routes/config";

// Mount modular routers
app.use("/dashboard", staticRouter);
app.use("/dashboard", dashboardRouter);
app.use("/dashboard", configRouter);
app.use("/dashboard", (req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  const fs = require("node:fs");
  const path = require("node:path");
  const htmlPath = path.join(__dirname, "..", "..", "server", "public", "index.html");
  if (fs.existsSync(htmlPath)) res.end(fs.readFileSync(htmlPath));
  else {
    res.statusCode = 404;
    res.end("Dashboard HTML not found at " + htmlPath);
  }
});
app.use("/public", staticRouter);


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

server.listen(Number(PORT), '127.0.0.1', () => {
  logger.info(`[MCP] Server listening on 127.0.0.1:${PORT}`);
});

initWebSocket(server);

import { startOfflineSync } from "./workers/offlineSync";
startOfflineSync();

import { startTelemetryPersister } from "./engine/telemetryPersister";
startTelemetryPersister();

import { startVscodeBridge } from "./ipc/vscodeBridge";
startVscodeBridge();

import { emit } from "./engine/events";

export const MANIFEST = {
  id: "index.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "node:http",
    "/dashboard",
    "/public"
  ],
  dependencies: [
    "node:http",
    "./routes/proposals",
    "./routes/decision",
    "./routes/health",
    "./routes/federation",
    "./routes/dashboard",
    "./ws",
    "./utils/Router",
    "./utils/logger",
    "./routes/telemetry",
    "./workers/offlineSync",
    "./engine/events"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};


emit("engine:start", { port: Number(PORT), pid: process.pid });

