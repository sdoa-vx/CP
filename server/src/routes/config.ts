import { Router } from "../utils/Router";
import { db } from "../fisp/database";
import { emit } from "../engine/events";
import { reinitializeSupabaseClient } from "../utils/supabase";

export const MANIFEST = {
  id: "config.ts",
  type: "module",
  layer: 3,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "/api/config"
  ],
  dependencies: [
    "../utils/Router",
    "../fisp/database",
    "../engine/events"
  ],
  docs: "Provides central configuration for the SDOA MCP Engine"
};

const router = new Router();

const DEFAULT_CONFIG = {
  theme: "dark",
  syncEnabled: true,
  thresholds: {
    workflow: 3,
    primitive: 5,
    schema: 2
  }
};

function getConfig() {
  const row = db.prepare("SELECT value FROM metadata_store WHERE key = 'engine_config'").get() as any;
  const envConfig = {
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseKey: process.env.SUPABASE_KEY || ""
  };
  if (!row) return { ...DEFAULT_CONFIG, ...envConfig };
  try {
    return { ...DEFAULT_CONFIG, ...envConfig, ...JSON.parse(row.value) };
  } catch (e) {
    return { ...DEFAULT_CONFIG, ...envConfig };
  }
}

function setConfig(newConfig: any) {
  const merged = { ...getConfig(), ...newConfig };
  db.prepare("INSERT INTO metadata_store (key, value) VALUES ('engine_config', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(merged));
  return merged;
}

router.get("/api/config/get", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(getConfig()));
});

router.post("/api/config/set", (req, res) => {
  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", () => {
    try {
      const payload = JSON.parse(body);
      const updated = setConfig(payload);
      emit("config:updated", updated);
      reinitializeSupabaseClient(updated.supabaseUrl, updated.supabaseKey);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "ok", config: updated }));
    } catch (e) {
      res.statusCode = 400;
      res.end("Invalid JSON");
    }
  });
});

router.post("/api/config/reset", (req, res) => {
  db.prepare("DELETE FROM metadata_store WHERE key = 'engine_config'").run();
  emit("config:updated", DEFAULT_CONFIG);
  reinitializeSupabaseClient(undefined, undefined);
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ status: "ok", config: DEFAULT_CONFIG }));
});

export default router;
