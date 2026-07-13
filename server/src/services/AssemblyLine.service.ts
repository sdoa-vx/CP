import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import { emit, subscribe, unsubscribe } from "../engine/events";
import { Chronicle } from "./Chronicle.service";

import { Provisioner } from "./Provisioner.service";

export interface FabricationHandoff {
  handoff(moduleId: string, artifactPath: string): boolean;
}

export interface ProcessEntry {
  id: string;
  child: ChildProcess;
  pid: number | undefined;
  status: "running" | "exited" | "crashed";
  startedAt: string;
  crashCount: number;
  log: string[];
}

export interface SpawnOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  shell?: boolean;
  autoRestart?: boolean;
  maxRestarts?: number;
  restartDelayMs?: number;
}

export class AssemblyLineService {
  static MANIFEST = {
    id: "AssemblyLine.service",
    type: "service",
    layer: 3,
    runtime: "TypeScript",
    version: "5.0.0",
    operationalRole: "assemblyline"
  };

  private _processes = new Map<string, ProcessEntry>();
  private _timers = new Set<NodeJS.Timeout>();
  private _handoff: FabricationHandoff = Provisioner;
  private _busUnsub: Array<() => void> = [];
  
  // A temporary build dir
  private _buildDir = path.resolve(process.cwd(), "build_staging");

  async init() {
    if (!fs.existsSync(this._buildDir)) {
      fs.mkdirSync(this._buildDir, { recursive: true });
    }
    this._subscribeEvents();
  }

  async run() {
    return { status: "ready", processCount: this._processes.size };
  }

  async dispose() {
    this._unsubscribeEvents();
    for (const timer of this._timers) clearTimeout(timer);
    this._timers.clear();
    for (const p of this._processes.values()) {
      try { p.child.kill(); } catch (_) {}
    }
    this._processes.clear();
  }

  spawnProcess({ id, cmd, args = [], options = {} }: { id: string, cmd: string, args?: string[], options?: SpawnOptions }) {
    if (!id || !cmd) throw new Error("AssemblyLine: `id` and `cmd` are required.");
    if (this._processes.has(id)) {
      return { ok: true, message: "Process already active", pid: this._processes.get(id)!.pid };
    }

    try {
      const child = spawn(cmd, args, {
        cwd: options.cwd ?? process.cwd(),
        env: { ...process.env, ...options.env },
        shell: options.shell ?? false,
        stdio: ["pipe", "pipe", "pipe"]
      });

      const entry: ProcessEntry = { id, child, pid: child.pid, status: "running", startedAt: new Date().toISOString(), crashCount: 0, log: [] };
      this._processes.set(id, entry);

      child.stdout?.on("data", (data) => {
        const text = data.toString();
        entry.log.push(`[stdout] ${text}`);
        this._emit("assembly:processOutput", { id, type: "stdout", data: text });
      });

      child.stderr?.on("data", (data) => {
        const text = data.toString();
        entry.log.push(`[stderr] ${text}`);
        this._emit("assembly:processOutput", { id, type: "stderr", data: text });
      });

      child.on("close", (code) => {
        entry.status = "exited";
        this._emit("assembly:processExited", { id, exitCode: code });
        if (code !== 0 && options.autoRestart) {
          this._restartProcess(id, cmd, args, options);
        }
      });

      child.on("error", (err) => {
        entry.status = "crashed";
        entry.log.push(`[error] ${err.message}`);
        this._emit("assembly:processCrashed", { id, error: err.message });
      });

      this._emit("assembly:processStarted", { id, pid: child.pid });
      return { ok: true, pid: child.pid };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  sendInput({ id, data }: { id: string, data: string }) {
    const entry = this._processes.get(id);
    if (entry && entry.status === "running") {
      entry.child.stdin?.write(data);
      return true;
    }
    return false;
  }

  killProcess({ id }: { id: string }) {
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

  getProcessLog(id: string) {
    const entry = this._processes.get(id);
    return entry ? entry.log : [];
  }

  // The Agentic Fabrication Pipeline
  async fabricateSleeve(moduleId: string, sourceData: string) {
    const safeId = moduleId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const sourcePath = path.join(this._buildDir, `${safeId}.ts`);
    const outPath = path.join(this._buildDir, `${safeId}.js`);

    fs.writeFileSync(sourcePath, sourceData, "utf-8");
    
    // Spawn a TS build subprocess
    const procId = `build_${safeId}_${Date.now()}`;
    const result = this.spawnProcess({
      id: procId,
      cmd: "npx",
      args: ["tsc", sourcePath, "--outDir", this._buildDir, "--esModuleInterop", "--skipLibCheck"],
      options: { cwd: this._buildDir, shell: true }
    });

    if (!result.ok) {
      Chronicle.recordEvent("assembly:fabrication_failed", { moduleId, error: result.error }, "AssemblyLine");
      return { ok: false, error: result.error };
    }

    // Monitor completion
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const proc = this._processes.get(procId);
        if (proc && proc.status !== "running") {
          clearInterval(checkInterval);
          if (fs.existsSync(outPath)) {
            Chronicle.recordEvent("assembly:fabrication_success", { moduleId, procId }, "AssemblyLine");
            this._handoff.handoff(moduleId, outPath);
            resolve({ ok: true, moduleId, outPath, logs: proc.log });
          } else {
            Chronicle.recordEvent("assembly:fabrication_failed", { moduleId, procId, logs: proc.log }, "AssemblyLine");
            resolve({ ok: false, error: "Output file not found after build.", logs: proc.log });
          }
        }
      }, 500);
      
      // Safety timeout (30 seconds)
      setTimeout(() => {
        clearInterval(checkInterval);
        this.killProcess({ id: procId });
        resolve({ ok: false, error: "Build timeout." });
      }, 30000);
    });
  }

  private _restartProcess(id: string, cmd: string, args: string[], options: SpawnOptions) {
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
        this._emit("assembly:processCrashed", { id, error: "Max restarts reached. Terminating." });
      }
    }
  }

  private _subscribeEvents() {
    const onAnomalyDetected = (payload: any) => {
      // Rebuild or flag when drift/latency goes too high
      Chronicle.recordEvent("assembly:anomaly_reaction", { payload }, "AssemblyLine");
    };

    const onChronicleRecorded = (payload: any) => {
      // Automatically fabricate a module if a proposal is merged
      if (payload?.type === "event:proposal_merged") {
        const data = payload.payload?.data;
        if (data?.files) {
          for (const file of data.files) {
            if (file.content) {
              this.fabricateSleeve(file.name || "module_auto", file.content);
            }
          }
        }
      }
    };

    const onInnovationValidated = (payload: any) => {
      const { candidateId, generatedModulePath } = payload;
      try {
        const content = fs.readFileSync(generatedModulePath, "utf-8");
        const moduleId = path.basename(generatedModulePath, ".ts");
        
        // Fabricate the sleeve
        this.fabricateSleeve(moduleId, content).then((result: any) => {
          if (result.ok) {
            this._emit("innovation:built", { candidateId, moduleId, artifactPath: result.outPath });
          } else {
            this._emit("innovation:failed", { candidateId, error: result.error });
          }
        });
      } catch (err: any) {
        this._emit("innovation:failed", { candidateId, error: err.message });
      }
    };

    subscribe("pulse:anomalyDetected", onAnomalyDetected);
    subscribe("chronicle:entryRecorded", onChronicleRecorded);
    subscribe("innovation:validated", onInnovationValidated);

    this._busUnsub.push(
      () => unsubscribe("pulse:anomalyDetected", onAnomalyDetected),
      () => unsubscribe("chronicle:entryRecorded", onChronicleRecorded),
      () => unsubscribe("innovation:validated", onInnovationValidated)
    );
  }

  private _unsubscribeEvents() {
    this._busUnsub.forEach(fn => fn());
    this._busUnsub = [];
  }

  private _emit(name: string, payload: any) {
    emit(name, payload);
  }
}

export const AssemblyLine = new AssemblyLineService();
