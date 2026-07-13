// ------------------------------------------------------------------
// File:    ConfigSovereign.service.ts
// Version: 1.0.0
// Updated: 2026-07-13T11:15:00Z
// Changes: Initial release of SDOA config/secrets resolver service
// ------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import { logger } from "../utils/logger";

export const MANIFEST = {
  id: "ConfigSovereign.service",
  type: "service",
  layer: 3,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "captain",
  optimization: { priority: "safety", assertionSuite: "" },
  requires: [],
  dependencies: ["node:fs", "node:path", "../utils/logger"],
  dataFiles: ["authorities/config.json"],
  lifecycle: ["init", "run", "dispose"],
  actions: {
    commands: {
      getLogicalConfig: { description: "Returns service endpoint maps." },
      resolveSecret: { description: "Loads credentials from environment." }
    },
    events: {},
    accepts: {},
    slots: {}
  },
  docs: {
    description: "Sovereign configuration authority managing credentials and service routing.",
    sdoa: "5.3.0"
  },
  last_modified: "2026-07-13T11:15:00Z"
};

export class ConfigSovereignService {
  private configPath = path.resolve(process.cwd(), "authorities", "config.json");
  private configData: any = null;

  async init() {
    logger.info("[ConfigSovereign] Initializing Configuration Sovereign...");
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, "utf-8");
        this.configData = JSON.parse(raw);
        logger.info("[ConfigSovereign] Bound config successfully.");
      } else {
        logger.warn(`[ConfigSovereign] Config file not found at ${this.configPath}. Using defaults.`);
        this.configData = {
          services: {
            supabase: { url: process.env.SUPABASE_URL || "" },
            cloudMcp: { endpoint: "https://mcp.tracksdoa.us" },
            localModel: { endpoint: "http://127.0.0.1:11434" }
          }
        };
      }
    } catch (err: any) {
      logger.error("[ConfigSovereign] Error loading config:", err);
      this.configData = {};
    }
  }

  async run() {
    return { ok: true, state: "active" };
  }

  async dispose() {
    this.configData = null;
  }

  getLogicalConfig() {
    if (!this.configData) {
      return {};
    }
    return this.configData.services || {};
  }

  resolveSecret(serviceName: string): string {
    // Resolve credentials based on logical name mappings
    switch (serviceName.toLowerCase()) {
      case "supabase":
        return process.env.SUPABASE_KEY || "";
      case "cloudmcp":
        return process.env.MCP_INTERNAL_SECRET || process.env.FEDERATION_SECRET || "";
      case "localmodel":
        return process.env.OPENROUTER_API_KEY || "";
      default:
        // Fallback directly to env lookup
        return process.env[serviceName.toUpperCase()] || "";
    }
  }
}

export const ConfigSovereign = new ConfigSovereignService();
