// ───────────────────────────
// File:    server.js
// Version: 1.1.00
// Updated: 2026-06-18T00:00:00Z
// Changes: Added MCP tool registrations for SDOA workflows and run management
// ───────────────────────────

import { StdioServer } from '@modelcontextprotocol/sdk/server';
import { z } from 'zod';
import Database from 'better-sqlite3';

import { PortfolioManager } from './PortfolioManager.service.js';
import { CapabilityGraph } from './graph/engine.js';
import { RunManager } from './RunManager.service.js';
import { ConstraintSolver } from './ConstraintSolver.service.js';
import { PipelineStateMachine } from './PipelineStateMachine.js';

import { AnalyzeWorkflow } from './workflows/Analyze.workflow.js';
import { MapWorkflow } from './workflows/Map.workflow.js';
import { ReuseWorkflow } from './workflows/Reuse.workflow.js';
import { InnovateWorkflow } from './workflows/Innovate.workflow.js';
import { PlanWorkflow } from './workflows/Plan.workflow.js';
import { PatchWorkflow } from './workflows/Patch.workflow.js';
import { AuditWorkflow } from './workflows/Audit.workflow.js';
import { MigrateWorkflow } from './workflows/Migrate.workflow.js';
import { VerifyWorkflow } from './workflows/Verify.workflow.js';

const SDOA_DB = process.env.SDOA_DB || '.sdoa/pipeline.db';
const db = new Database(SDOA_DB);

// Instantiate core authorities
const portfolioManager = new PortfolioManager();
const graph = new CapabilityGraph(db);
const runManager = new RunManager(null);
const constraintSolver = new ConstraintSolver(null);
const stateMachine = new PipelineStateMachine(null);

// Create generic registry for workflows
const registry = {
  get: (name) => {
    const map = {
      'PortfolioManager': portfolioManager,
      'CapabilityGraph': graph,
      'RunManager': runManager,
      'ConstraintSolver': constraintSolver,
      'PipelineStateMachine': stateMachine,
      'db': db
    };
    return map[name];
  }
};

// Wire registry to core services
runManager.registry = registry;
constraintSolver.registry = registry;
stateMachine.registry = registry;

const server = new StdioServer({
  name: 'sdoavx-mcp',
  version: '1.1.0',
});

function ensureCoreTables() {
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
      resolved INTEGER
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
}

ensureCoreTables();
portfolioManager.upsertPortfolioIntoModulesTable();

// ───────────────────────────
// Phase Tool Registration
// ───────────────────────────

function registerPhaseTool(server, phaseName, WorkflowClass) {
  const toolName = `sdoa.${phaseName.toLowerCase()}`;
  server.tool(
    toolName,
    {
      inputSchema: z.object({
        runId: z.string().describe("The active run UUID"),
        payload: z.any().optional().describe("Phase specific parameters")
      }),
      outputSchema: z.object({
        runId: z.string(),
        phase: z.string(),
        ok: z.boolean(),
        result: z.any().optional(),
        error: z.string().optional()
      })
    },
    async (input) => {
      const now = new Date().toISOString();
      const workflow = new WorkflowClass(registry);
      
      db.prepare(`UPDATE runs SET status = ?, currentPhase = ?, updatedAt = ? WHERE runId = ?`)
        .run('running', phaseName, now, input.runId);
        
      const res = await workflow.run(input.payload || { runId: input.runId, path: '.' });
      
      db.prepare(`
        INSERT INTO phases (runId, phase, status, outputJson, completedAt)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(runId, phase) DO UPDATE SET
          status = excluded.status,
          outputJson = excluded.outputJson,
          completedAt = excluded.completedAt
      `).run(input.runId, phaseName, res.ok ? 'complete' : 'failed', JSON.stringify(res), new Date().toISOString());
      
      return { runId: input.runId, phase: phaseName, ...res };
    }
  );
}

registerPhaseTool(server, 'ANALYZE', AnalyzeWorkflow);
registerPhaseTool(server, 'MAP', MapWorkflow);
registerPhaseTool(server, 'REUSE', ReuseWorkflow);
registerPhaseTool(server, 'INNOVATE', InnovateWorkflow);
registerPhaseTool(server, 'PLAN', PlanWorkflow);
registerPhaseTool(server, 'PATCH', PatchWorkflow);
registerPhaseTool(server, 'AUDIT', AuditWorkflow);
registerPhaseTool(server, 'MIGRATE', MigrateWorkflow);
registerPhaseTool(server, 'VERIFY', VerifyWorkflow);

// ───────────────────────────
// Run Management Tools
// ───────────────────────────

server.tool(
  'sdoa.run.list',
  {
    inputSchema: z.object({
      limit: z.number().optional().default(10)
    }),
    outputSchema: z.object({
      runs: z.array(z.any())
    })
  },
  async (input) => {
    const runs = db.prepare(`SELECT * FROM runs ORDER BY createdAt DESC LIMIT ?`).all(input.limit);
    return { runs };
  }
);

server.tool(
  'sdoa.run.status',
  {
    inputSchema: z.object({
      runId: z.string()
    }),
    outputSchema: z.object({
      runId: z.string(),
      status: z.string(),
      currentPhase: z.string(),
      phases: z.array(z.any())
    })
  },
  async (input) => {
    const runInfo = db.prepare(`SELECT * FROM runs WHERE runId = ?`).get(input.runId);
    if (!runInfo) return { runId: input.runId, status: 'NOT_FOUND', currentPhase: '', phases: [] };
    const phases = db.prepare(`SELECT * FROM phases WHERE runId = ?`).all(input.runId);
    return { ...runInfo, phases };
  }
);

server.tool(
  'sdoa.run.resume',
  {
    inputSchema: z.object({
      runId: z.string()
    }),
    outputSchema: z.object({
      runId: z.string(),
      ok: z.boolean(),
      message: z.string()
    })
  },
  async (input) => {
    db.prepare(`UPDATE runs SET status = ?, updatedAt = ? WHERE runId = ?`).run('resumed', new Date().toISOString(), input.runId);
    return { runId: input.runId, ok: true, message: "Run resumed." };
  }
);

server.tool(
  'sdoa.run.reset',
  {
    inputSchema: z.object({
      runId: z.string()
    }),
    outputSchema: z.object({
      runId: z.string(),
      ok: z.boolean(),
      message: z.string()
    })
  },
  async (input) => {
    db.transaction(() => {
      db.prepare(`DELETE FROM phases WHERE runId = ?`).run(input.runId);
      db.prepare(`DELETE FROM violations WHERE runId = ?`).run(input.runId);
      db.prepare(`UPDATE runs SET status = 'reset', currentPhase = 'INIT', updatedAt = ? WHERE runId = ?`)
        .run(new Date().toISOString(), input.runId);
    })();
    return { runId: input.runId, ok: true, message: "Run state reset." };
  }
);

server.start();
