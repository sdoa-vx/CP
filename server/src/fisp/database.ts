import Database from 'better-sqlite3';
import path from 'path';

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
