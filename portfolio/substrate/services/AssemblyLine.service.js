// ──────────────────────────────────────────────────────────────────
// File:    AssemblyLine.service.js
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure (6.9-only file)
// ──────────────────────────────────────────────────────────────────
"use strict";

const { spawn } = require("child_process");

class AssemblyLineService {
  static MANIFEST = {
    id: "AssemblyLine.service", type: "service", layer: 3, runtime: "NodeJS", version: "5.0.0",
    operationalRole: "assemblyline", requires: [], dataFiles: [], lifecycle: ["init", "run", "dispose"],
    actions: {
      commands: {
        spawnProcess:  { description: "Spawn a polyglot subprocess.", input: { id: "string", cmd: "string", args: "string[]?", options: "object?" }, output: "object" },
        sendInput:     { description: "Send data to subprocess stdin.", input: { id: "string", data: "string" }, output: "boolean" },
        killProcess:   { description: "Terminate a subprocess.", input: { id: "string" }, output: "boolean" },
        getProcesses:  { description: "Get status of tracked subprocesses.", input: {}, output: "object[]" },
        initMemoryMap: { description: "Initialize SharedArrayBuffer memory mapping.", input: { size: "number?" }, output: "object" }
      },
      events: {
        "assembly:processStarted": { payload: { id: "string", pid: "number" } },
        "assembly:processExited":  { payload: { id: "string", exitCode: "number" } },
        "assembly:processCrashed": { payload: { id: "string", error: "string" } },
        "assembly:processOutput":  { payload: { id: "string", type: "string", data: "string" } }
      },
      accepts: {}, slots: {}
    },
    docs: {
      description: "Subprocess management and polyglot bridge service.",
      author: "ProtoAI Core Architecture Group", sdoa: "5.0.0"
    }
  };

  _registry   = null;
  _processes  = new Map();
  _memoryMap  = null;
  _heartbeats = new Map();

  async init(registry) {
    this._registry = registry;
  }

  async run() {
    return { status: "ready", processCount: this._processes.size };
  }

  spawnProcess({ id, cmd, args = [], options = {} } = {}) {
    if (!id || !cmd) throw new Error("AssemblyLine: `id` and `cmd` are required.");
    if (this._processes.has(id)) {
      return { ok: true, message: "Process already active", pid: this._processes.get(id).pid };
    }

    try {
      const child = spawn(cmd, args, {
        cwd: options.cwd ?? process.cwd(),
        env: { ...process.env, ...options.env },
        shell: options.shell ?? false,
        stdio: ["pipe", "pipe", "pipe"]
      });

      const entry = { id, child, pid: child.pid, status: "running", startedAt: new Date().toISOString(), crashCount: 0 };
      this._processes.set(id, entry);

      child.stdout.on("data", (data) => {
        const text = data.toString();
        this._emit("assembly:processOutput", { id, type: "stdout", data: text });
      });

      child.stderr.on("data", (data) => {
        const text = data.toString();
        this._emit("assembly:processOutput", { id, type: "stderr", data: text });
      });

      child.on("close", (code) => {
        entry.status = "exited";
        this._emit("assembly:processExited", { id, exitCode: code });
        if (code !== 0 && options.autoRestart) {
          this._restartProcess(id, cmd, args, options);
        } else {
          this._processes.delete(id);
        }
      });

      child.on("error", (err) => {
        this._emit("assembly:processCrashed", { id, error: err.message });
      });

      this._emit("assembly:processStarted", { id, pid: child.pid });
      return { ok: true, pid: child.pid };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  sendInput({ id, data } = {}) {
    const entry = this._processes.get(id);
    if (entry && entry.status === "running") {
      entry.child.stdin.write(data);
      return true;
    }
    return false;
  }

  killProcess({ id } = {}) {
    const entry = this._processes.get(id);
    if (entry) {
      entry.child.kill();
      this._processes.delete(id);
      return true;
    }
    return false;
  }

  getProcesses() {
    return [...this._processes.values()].map(p => ({
      id: p.id, pid: p.pid, status: p.status, startedAt: p.startedAt, crashCount: p.crashCount
    }));
  }

  initMemoryMap({ size = 1024 * 1024 } = {}) {
    const sab = new SharedArrayBuffer(size);
    const view = new Uint8Array(sab);
    this._memoryMap = { sab, view, size };
    return { ok: true, size };
  }

  _timers = new Set();

  _restartProcess(id, cmd, args, options) {
    const entry = this._processes.get(id);
    if (entry) {
      entry.crashCount++;
      if (entry.crashCount < (options.maxRestarts ?? 3)) {
        const timer = setTimeout(() => {
          this._timers.delete(timer);
          this.spawnProcess({ id, cmd, args, options });
        }, options.restartDelayMs ?? 1000);
        this._timers.add(timer);
      } else {
        this._processes.delete(id);
        this._emit("assembly:processCrashed", { id, error: "Max restarts reached. Terminating." });
      }
    }
  }

  async dispose() {
    for (const timer of this._timers) clearTimeout(timer);
    this._timers.clear();
    for (const p of this._processes.values()) {
      try { p.child.kill(); } catch (_) {}
    }
    this._processes.clear();
    this._registry = null;
    this._memoryMap = null;
  }

  _getBus()             { return this._registry?.get?.("EventBus.service"); }
  _emit(name, payload)  { try { this._getBus()?.emit?.(name, payload); } catch (_) {} }
}

module.exports = AssemblyLineService;
