// ──────────────────────────────────────────────────────────────────
// File:    Chronicle.persistence.js
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure (6.9-only file)
// ──────────────────────────────────────────────────────────────────
"use strict";

const fs   = require("fs");
const path = require("path");

class ChroniclePersistenceService {
  static MANIFEST = {
    id: "Chronicle.persistence", type: "service", layer: 3, runtime: "NodeJS", version: "5.0.0",
    operationalRole: "savant",
    requires: [], dataFiles: [], lifecycle: ["init", "run", "dispose"],
    actions: {
      commands: {
        append:         { description: "Append a single Chronicle entry to the persistent JSONL log.", input: { entry: "object" }, output: "void" },
        load:           { description: "Read all entries from the JSONL log file and return them as an array.", input: {}, output: "object[]" },
        rotate:         { description: "Archive the current log file and start a new one.", input: {}, output: "object" },
        checkpoint:     { description: "Write a full chain snapshot to a separate checkpoint file.", input: { entries: "object[]" }, output: "void" },
        loadCheckpoint: { description: "Load the most recent checkpoint snapshot.", input: {}, output: "object[]|null" },
        getStats:       { description: "Return stats about the persistence layer.", input: {}, output: "object" }
      },
      events: {
        "chronicle.persistence:rotated":      { payload: { archivedPath: "string", newPath: "string", entryCount: "number" } },
        "chronicle.persistence:checkpointed": { payload: { entryCount: "number", path: "string" } },
        "chronicle.persistence:error":        { payload: { operation: "string", error: "string" } }
      },
      accepts: {}, slots: {}
    },
    docs: {
      description: "Append-only JSONL persistence layer for the Chronicle audit chain. Writes every Chronicle entry to disk immediately after recording, enabling chain reconstruction after process restart.",
      author: "ProtoAI Core Architecture Group", sdoa: "5.0.0"
    }
  };

  _logPath        = null;
  _checkpointPath = null;
  _archiveDir     = null;
  _maxSizeMb      = 50;
  _lastWriteAt    = null;
  _registry       = null;

  async init(registry) {
    this._registry       = registry;
    this._logPath        = process.env.CHRONICLE_LOG_PATH
                        ?? path.join(process.cwd(), "data", "chronicle", "chain.jsonl");
    this._checkpointPath = process.env.CHRONICLE_CHECKPOINT_PATH
                        ?? path.join(process.cwd(), "data", "chronicle", "checkpoint.json");
    this._archiveDir     = path.join(path.dirname(this._logPath), "archive");
    fs.mkdirSync(path.dirname(this._logPath), { recursive: true });
    fs.mkdirSync(this._archiveDir,            { recursive: true });
  }

  async run()     { return this.getStats(); }
  async dispose() { this._registry = null; }

  append({ entry } = {}) {
    try {
      fs.appendFileSync(this._logPath, JSON.stringify(entry) + "\n");
      this._lastWriteAt = new Date().toISOString();
      const stat = fs.statSync(this._logPath);
      if (stat.size > this._maxSizeMb * 1024 * 1024) this.rotate();
    } catch (e) {
      this._emit("chronicle.persistence:error", { operation: "append", error: e.message });
    }
  }

  load() {
    if (!fs.existsSync(this._logPath)) return [];
    const lines   = fs.readFileSync(this._logPath, "utf8").split("\n");
    const entries = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try { entries.push(JSON.parse(line)); } catch (_) {}
    }
    return entries;
  }

  rotate() {
    const entries  = this.load();
    const ts       = new Date().toISOString().replace(/[:.]/g, "-");
    const archived = path.join(this._archiveDir, `chain-${ts}.jsonl`);
    try {
      fs.copyFileSync(this._logPath, archived);
      fs.writeFileSync(this._logPath, "");
      this._emit("chronicle.persistence:rotated", { archivedPath: archived, newPath: this._logPath, entryCount: entries.length });
      return { archivedPath: archived, newPath: this._logPath };
    } catch (e) {
      this._emit("chronicle.persistence:error", { operation: "rotate", error: e.message });
      return { archivedPath: null, newPath: this._logPath };
    }
  }

  checkpoint({ entries = [] } = {}) {
    try {
      fs.writeFileSync(this._checkpointPath, JSON.stringify(entries));
      fs.writeFileSync(this._checkpointPath + ".meta.json", JSON.stringify({
        writtenAt:  new Date().toISOString(),
        entryCount: entries.length,
        chainHash:  entries[entries.length - 1]?.hash ?? null,
      }));
      this._emit("chronicle.persistence:checkpointed", { entryCount: entries.length, path: this._checkpointPath });
    } catch (e) {
      this._emit("chronicle.persistence:error", { operation: "checkpoint", error: e.message });
    }
  }

  loadCheckpoint() {
    if (!fs.existsSync(this._checkpointPath)) return null;
    try { return JSON.parse(fs.readFileSync(this._checkpointPath, "utf8")); } catch (_) { return null; }
  }

  getStats() {
    let logSizeBytes = 0, checkpointExists = false, checkpointAge = null;
    try { logSizeBytes = fs.statSync(this._logPath).size; } catch (_) {}
    if (fs.existsSync(this._checkpointPath + ".meta.json")) {
      try {
        const meta   = JSON.parse(fs.readFileSync(this._checkpointPath + ".meta.json", "utf8"));
        checkpointExists = true;
        checkpointAge    = meta.writtenAt ? Date.now() - new Date(meta.writtenAt).getTime() : null;
      } catch (_) {}
    }
    return {
      logPath: this._logPath, logSizeBytes, logSizeMb: logSizeBytes / (1024 * 1024),
      checkpointPath: this._checkpointPath, checkpointExists, checkpointAge,
      lastWriteAt: this._lastWriteAt,
    };
  }

  _getBus()             { return this._registry?.get?.("EventBus.service"); }
  _emit(name, payload)  { try { this._getBus()?.emit?.(name, payload); } catch (_) {} }
}

module.exports = ChroniclePersistenceService;
