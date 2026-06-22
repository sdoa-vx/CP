import Database from 'better-sqlite3';
import path from 'node:path';

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
  console.warn("Columns ci_status or ci_log_url might already exist in pr_metadata.", e);
}

// Ensure Github Installations table exists
db.prepare(`
  CREATE TABLE IF NOT EXISTS github_installations (
    installation_id INTEGER PRIMARY KEY,
    account_name TEXT,
    repositories TEXT
  )
`).run();
