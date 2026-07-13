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
import { evaluateConnection } from "./utils/supabase.js";

// Non-blocking background touch to start Supabase cold load immediately
evaluateConnection().then(connected => {
  if (connected) {
    logger.info("[SDOA] Supabase is online and responsive.");
  } else {
    logger.warn("[SDOA] Supabase touch initiated. Waking up database in background...");
  }
}).catch(() => {});

const PORT = process.env.PORT || 8080;
const app = new Router();

// Auth Middleware wrapper (Removed for seamless local testing)
app.use("/dashboard", (req, res, next) => {
  if (next) next();
});
app.use("/public", (req, res, next) => {
  if (next) next();
});

import configRouter from "./routes/config";
import chronicleRouter from "./routes/chronicle";
import pulseRouter from "./routes/pulse";
import assemblyRouter from "./routes/assembly";
import provisionerRouter from "./routes/provisioner";
import lifecycleRouter from "./routes/lifecycle";
import arbitrationRouter from "./routes/arbitration";
import meshRouter from "./routes/mesh";
import timemachineRouter from "./routes/timemachine";
import governanceRouter from "./routes/governance";
import primeRouter from "./routes/prime";
import diagnosticsRouter from "./routes/diagnostics";
import reportRouter from "./routes/report";
import webhooksRouter from "./routes/webhooks";

// Mount modular routers
app.use("/dashboard", dashboardRouter);
app.use("/dashboard", configRouter);
app.use("/dashboard", chronicleRouter);
app.use("/dashboard", pulseRouter);
app.use("/dashboard", assemblyRouter);
app.use("/dashboard", provisionerRouter);
app.use("/dashboard", lifecycleRouter);
app.use("/dashboard", arbitrationRouter);
app.use("/dashboard", meshRouter);
app.use("/dashboard", timemachineRouter);
app.use("/dashboard", governanceRouter);
app.use("/dashboard", primeRouter);
app.use("/dashboard", diagnosticsRouter);
app.use("/dashboard", reportRouter);
app.use("/api/github/webhooks", webhooksRouter);
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

import { startPrJobWorker } from "./workers/prJobWorker";
startPrJobWorker();

import { Chronicle } from "./services/Chronicle.service";
import { Pulse } from "./services/Pulse.service";
import { AssemblyLine } from "./services/AssemblyLine.service";
import { Provisioner } from "./services/Provisioner.service";
import { LifecycleManager } from "./services/LifecycleManager.service";
import { TransportArbitration } from "./services/TransportArbitration.service";
import { TimeMachine } from "./services/TimeMachine.service";
import { GovernanceRules } from "./services/GovernanceRules.service";
import { ProbationOfficer } from "./services/ProbationOfficer.service";
import { PrimeDiscovery } from "./services/PrimeDiscovery.service";
import { SDOAClassifier } from "./services/SDOAClassifier.service";
import { SupabaseSync } from "./services/SupabaseSync.service";
import { DiagnosticRunner } from "./services/DiagnosticRunner.service";
import { AiProviderManager } from "./services/AiProviderManager.service";
import { LocalSynthesizer } from "./services/LocalSynthesizer.service";
import { WorkspaceWatcher } from "./services/WorkspaceWatcher.service";
import { ConfigSovereign } from "./services/ConfigSovereign.service";
import { Orchestrator } from "./services/Orchestrator.service";

async function bootSovereignAuthorities() {
  logger.info("Booting Configuration Sovereign (Authority: Config & Credentials)...");
  await ConfigSovereign.init();
  await ConfigSovereign.run();

  logger.info("Booting Orchestrator (Authority: Model Fallbacks)...");
  await Orchestrator.init();
  await Orchestrator.run();

  logger.info("Booting Chronicle (Authority: Sovereign Ledger)...");
  Chronicle.initGenesis();
  Chronicle.loadFromDisk();
  Chronicle.recordEvent("engine:boot", { timestamp: new Date().toISOString() }, "Chronicle");
  
  const { db } = await import("./fisp/database.js");
  db.prepare("INSERT INTO run_log (runId, phase, level, message, timestamp) VALUES (?, ?, ?, ?, ?)").run('system', 'boot', 'info', 'System booted. Sovereign operational.', new Date().toISOString());
  
  logger.info("[Chronicle] Ledger initialized.");

  logger.info("Booting Pulse (Authority: Substrate Telemetry)...");
  await Pulse.init();
  await Pulse.run();

  logger.info("Booting AssemblyLine (Authority: Fabrication)...");
  await AssemblyLine.init();
  await AssemblyLine.run();

  logger.info("Booting Provisioner (Authority: Sleeve Registry)...");
  await Provisioner.init();
  await Provisioner.run();

  logger.info("Booting Lifecycle Manager (Authority: Deployments)...");
  await LifecycleManager.init();
  await LifecycleManager.run();

  logger.info("Booting Transport Arbitration (Authority: Routing)...");
  await TransportArbitration.init();
  await TransportArbitration.run();

  logger.info("Booting TimeMachine (Authority: Temporal Replay)...");
  await TimeMachine.init();
  await TimeMachine.run();

  logger.info("Booting Governance Rules (Authority: Ruleset)...");
  await GovernanceRules.init();
  await GovernanceRules.run();

  logger.info("Booting Probation Officer (Authority: Enforcement)...");
  await ProbationOfficer.init();
  await ProbationOfficer.run();
  
  logger.info("Booting Prime Discovery (Authority: Local Intelligence)...");
  await PrimeDiscovery.init();
  await PrimeDiscovery.run();
  
  logger.info("Booting SDOA Classifier (Authority: Sovereignty Recognition)...");
  await SDOAClassifier.init();
  await SDOAClassifier.run();
  
  logger.info("Booting Supabase Sync (Authority: Reporting Bridge)...");
  await SupabaseSync.init();
  await SupabaseSync.run();

  logger.info("Booting Diagnostic Runner (Authority: Self-Testing)...");
  await DiagnosticRunner.init();
  await DiagnosticRunner.run();

  logger.info("Booting AI Provider Manager...");
  await AiProviderManager.init();
  await AiProviderManager.run();

  logger.info("Booting Local Synthesizer (Authority: AI Code Generation)...");
  await LocalSynthesizer.init();
  await LocalSynthesizer.run();

  logger.info("Booting Workspace Watcher (Authority: File Operations)...");
  await WorkspaceWatcher.init();
  await WorkspaceWatcher.run();

  logger.info("Sovereign Authorities Boot Sequence Complete.");
}

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

bootSovereignAuthorities().catch(err => {
  logger.error("Fatal error during boot sequence", err);
});
