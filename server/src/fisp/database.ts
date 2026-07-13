import Database from 'better-sqlite3';
import path from 'node:path';

export const MANIFEST = {
  id: "database.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "db"
  ],
  dependencies: [
    "better-sqlite3",
    "node:path"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};

// Mirroring the setup from authorities/mcp/server.js
const SDOA_DB = process.env.SDOA_DB || path.join(process.cwd(), '.sdoa/pipeline.db');
export const db = new Database(SDOA_DB);

// Ensure the proposals table exists for FISP
db.prepare(`
  CREATE TABLE IF NOT EXISTS proposals (
    id TEXT PRIMARY KEY,
    status TEXT,
    data TEXT,
    timestamp TEXT,
    notes TEXT
  )
`).run();

// Ensure the offline sync queue table exists
db.prepare(`
  CREATE TABLE IF NOT EXISTS offline_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    target TEXT,
    payload TEXT,
    created_at TEXT
  )
`).run();

// Ensure PR metadata table exists
db.prepare(`
  CREATE TABLE IF NOT EXISTS pr_metadata (
    proposalId TEXT PRIMARY KEY,
    prUrl TEXT,
    status TEXT,
    ci_status TEXT,
    ci_log_url TEXT
  )
`).run();

try {
  db.prepare(`ALTER TABLE pr_metadata ADD COLUMN ci_status TEXT`).run();
  db.prepare(`ALTER TABLE pr_metadata ADD COLUMN ci_log_url TEXT`).run();
} catch (e) {
  // Suppress the error stack trace to avoid cluttering boot logs; this is expected if columns already exist.
}

// Ensure Github Installations table exists
db.prepare(`
  CREATE TABLE IF NOT EXISTS github_installations (
    installation_id INTEGER PRIMARY KEY,
    account_name TEXT,
    repositories TEXT
  )
`).run();

// Ensure Canonical Library table exists
db.prepare(`
  CREATE TABLE IF NOT EXISTS canonical_library (
    id TEXT PRIMARY KEY,
    module_id TEXT,
    version TEXT,
    payload TEXT,
    timestamp TEXT
  )
`).run();

// Ensure metadata_store exists for last_sync_time
db.prepare(`
  CREATE TABLE IF NOT EXISTS metadata_store (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`).run();

// Ensure telemetry_history exists
db.prepare(`
  CREATE TABLE IF NOT EXISTS telemetry_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT,
    ast_cache_size INTEGER,
    queue_depth INTEGER,
    detector_hits TEXT
  )
`).run();

// ── Shared with authorities/mcp/server.js — same pipeline.db ──────────────────
// These tables are also created by the MCP authority server. Ensuring them here
// means dashboard endpoints can query them even if the authority hasn't run yet.

db.prepare(`
  CREATE TABLE IF NOT EXISTS runs (
    runId TEXT PRIMARY KEY,
    input TEXT,
    inputType TEXT,
    status TEXT,
    currentPhase TEXT,
    createdAt TEXT,
    updatedAt TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS phases (
    runId TEXT,
    phase TEXT,
    status TEXT,
    outputJson TEXT,
    completedAt TEXT,
    PRIMARY KEY (runId, phase)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS violations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runId TEXT,
    phase TEXT,
    moduleId TEXT,
    rule TEXT,
    severity TEXT,
    message TEXT,
    resolved INTEGER DEFAULT 0
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS modules (
    id TEXT PRIMARY KEY,
    type TEXT,
    layer INTEGER,
    sovereignty TEXT,
    manifestJson TEXT,
    embedding BLOB,
    sdoaVersion TEXT,
    updatedAt TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS edges (
    fromId TEXT,
    toId TEXT,
    edgeType TEXT,
    PRIMARY KEY (fromId, toId, edgeType)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS run_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runId TEXT,
    phase TEXT,
    level TEXT,
    message TEXT,
    timestamp TEXT
  )
`).run();

