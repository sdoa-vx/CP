// ───────────────────────────
// File:    migrations/init-schema.js
// Version: 1.0.00
// Updated: 2026-06-18T00:00:00Z
// Changes: Initial pipeline.db schema + portfolio_updates
// ───────────────────────────

import Database from 'better-sqlite3';

const SDOA_DB = process.env.SDOA_DB || '.sdoa/pipeline.db';

const db = new Database(SDOA_DB);

db.exec(`
CREATE TABLE IF NOT EXISTS runs (
  runId TEXT PRIMARY KEY,
  input TEXT,
  inputType TEXT,
  status TEXT,
  currentPhase TEXT,
  createdAt TEXT,
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS phases (
  runId TEXT,
  phase TEXT,
  status TEXT,
  outputJson TEXT,
  completedAt TEXT,
  PRIMARY KEY (runId, phase)
);

CREATE TABLE IF NOT EXISTS violations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  runId TEXT,
  phase TEXT,
  moduleId TEXT,
  rule TEXT,
  severity TEXT,
  message TEXT,
  resolved INTEGER
);

CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  type TEXT,
  layer INTEGER,
  sovereignty TEXT,
  manifestJson TEXT,
  embedding BLOB,
  sdoaVersion TEXT,
  updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS edges (
  fromId TEXT,
  toId TEXT,
  edgeType TEXT,
  PRIMARY KEY (fromId, toId, edgeType)
);

CREATE TABLE IF NOT EXISTS run_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  runId TEXT,
  phase TEXT,
  level TEXT,
  message TEXT,
  timestamp TEXT
);

CREATE TABLE IF NOT EXISTS portfolio_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  runId TEXT,
  moduleId TEXT,
  type TEXT,
  reason TEXT,
  source TEXT,
  createdAt TEXT
);
`);

console.log('SDOA pipeline schema initialized at', SDOA_DB);
