// ───────────────────────────
// File:    PortfolioManager.service.js
// Version: 1.0.00
// Updated: 2026-06-18T00:00:00Z
// Changes: Initial hybrid portfolio manager (local + remote)
// ───────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import Database from 'better-sqlite3';

const SDOA_DB = process.env.SDOA_DB || '.sdoa/pipeline.db';
const ROOT_CWD = process.cwd();

const LOCAL_PORTFOLIO_ROOT =
  process.env.SDOA_LOCAL_PORTFOLIO ||
  path.join(ROOT_CWD, 'authorities', 'sdoa-portfolio');

const REMOTE_PORTFOLIO_ROOT =
  process.env.SDOA_REMOTE_PORTFOLIO ||
  path.join(ROOT_CWD, '.sdoa', 'remote-portfolio');

const REMOTE_PORTFOLIO_GIT =
  process.env.SDOA_REMOTE_PORTFOLIO_GIT ||
  'https://github.com/your-org/sdoa-portfolio.git';

export class PortfolioManager {
  constructor() {
    this.db = new Database(SDOA_DB);
    this.ensureTables();
  }

  ensureTables() {
    this.db
      .prepare(`
        CREATE TABLE IF NOT EXISTS portfolio_updates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          runId TEXT,
          moduleId TEXT,
          type TEXT,
          reason TEXT,
          source TEXT,        -- local | remote | generated
          createdAt TEXT
        )
      `)
      .run();
  }

  async syncRemotePortfolio({ allowClone = true } = {}) {
    if (!REMOTE_PORTFOLIO_GIT) return { ok: false, reason: 'no-remote-config' };

    const exists = fs.existsSync(REMOTE_PORTFOLIO_ROOT);

    if (!exists && !allowClone) {
      return { ok: false, reason: 'not-cloned' };
    }

    if (!exists) {
      await this.runGit(['clone', REMOTE_PORTFOLIO_GIT, REMOTE_PORTFOLIO_ROOT]);
      return { ok: true, action: 'cloned' };
    }

    await this.runGit(['pull'], { cwd: REMOTE_PORTFOLIO_ROOT });
    return { ok: true, action: 'pulled' };
  }

  runGit(args, opts = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, {
        stdio: 'inherit',
        ...opts,
      });

      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`git ${args.join(' ')} exited with ${code}`));
      });
    });
  }

  loadPortfolioModules() {
    const local = this.scanPortfolioRoot(LOCAL_PORTFOLIO_ROOT, 'local');
    const remote = fs.existsSync(REMOTE_PORTFOLIO_ROOT)
      ? this.scanPortfolioRoot(REMOTE_PORTFOLIO_ROOT, 'remote')
      : [];

    // merge: remote overrides local on same id
    const byId = new Map();
    for (const m of local) byId.set(m.id, m);
    for (const m of remote) byId.set(m.id, m);

    return Array.from(byId.values());
  }

  scanPortfolioRoot(root, source) {
    if (!fs.existsSync(root)) return [];

    const modules = [];

    const walk = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
          const manifest = this.extractManifest(full);
          if (manifest && manifest.id) {
            modules.push({
              ...manifest,
              source,
              filePath: full,
            });
          }
        }
      }
    };

    walk(root);
    return modules;
  }

  extractManifest(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');

    // very simple static extraction: look for "static MANIFEST = { ... }"
    const start = content.indexOf('static MANIFEST');
    if (start === -1) return null;

    const braceStart = content.indexOf('{', start);
    if (braceStart === -1) return null;

    let depth = 0;
    let i = braceStart;
    for (; i < content.length; i++) {
      const ch = content[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }

    const jsonish = content.slice(braceStart, i);

    // convert JS-ish to JSON-ish (best-effort; portfolio files should be clean)
    const normalized = jsonish
      .replace(/(\w+)\s*:/g, '"$1":')
      .replace(/'/g, '"')
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']');

    try {
      return JSON.parse(normalized);
    } catch {
      return null;
    }
  }

  upsertPortfolioIntoModulesTable() {
    const modules = this.loadPortfolioModules();

    const insert = this.db.prepare(`
      INSERT INTO modules (id, type, layer, sovereignty, manifestJson, embedding, sdoaVersion, updatedAt)
      VALUES (@id, @type, @layer, @sovereignty, @manifestJson, NULL, @sdoaVersion, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        layer = excluded.layer,
        sovereignty = excluded.sovereignty,
        manifestJson = excluded.manifestJson,
        sdoaVersion = excluded.sdoaVersion,
        updatedAt = excluded.updatedAt
    `);

    const now = new Date().toISOString();

    const sovereignty = 'authorities/sdoa-portfolio';

    this.db.transaction(() => {
      for (const m of modules) {
        insert.run({
          id: m.id,
          type: m.type || 'primitive',
          layer: m.layer ?? null,
          sovereignty,
          manifestJson: JSON.stringify(m),
          sdoaVersion: m.docs?.sdoa || '5.0.0',
          updatedAt: now,
        });
      }
    })();

    return { count: modules.length };
  }

  recordGeneratedModule({ runId, moduleId, type, reason }) {
    this.db
      .prepare(
        `
      INSERT INTO portfolio_updates (runId, moduleId, type, reason, source, createdAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        runId,
        moduleId,
        type,
        reason,
        'generated',
        new Date().toISOString()
      );
  }
}
