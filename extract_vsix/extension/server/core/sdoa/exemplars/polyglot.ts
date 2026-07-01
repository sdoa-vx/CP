// Last modified: 2026-06-09 08:33 UTC
// polyglot.ts — SDOAv5.0 Polyglot Subprocess Bridge

import { spawn, ChildProcess } from "child_process";
import * as path from "path";

export class PolyglotBridge {
  static MANIFEST = {
    id: "PolyglotBridge",
    type: "utility",
    layer: 3,
    version: "5.0.0",
    runtime: "NodeJS"
  };

  private child: ChildProcess | null = null;
  private pending = new Map<string, { resolve: Function; reject: Function }>();
  private buffer = "";

  constructor(
    private moduleId: string,
    private filePath: string,
    private registry: any
  ) {}

  private ensureStarted() {
    if (this.child) return;

    const python = process.env.SDOA_PYTHON || process.env.PROTOAI_PYTHON || (
      process.platform === "win32"
        ? "C:\\Users\\trech\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe"
        : "python3"
    );

    const script = `
import sys, json, importlib.util
sys.path.append("substrate/base")
import base
spec = importlib.util.spec_from_file_location("mod", sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
cls = None
for attr in dir(module):
    val = getattr(module, attr)
    if isinstance(val, type) and val not in (base.Service, base.SdoaModule, base.Adapter, base.Task, base.Component) and issubclass(val, base.SdoaModule):
        cls = val
        break
if not cls: sys.exit("No SdoaModule subclass found")
instance = cls()
for line in sys.stdin:
    try:
        req = json.loads(line)
        if req.get("type") == "call":
            method = getattr(instance, req["method"])
            res = method(*req.get("args", []), **req.get("kwargs", {}))
            sys.stdout.write(json.dumps({"type": "res", "id": req["id"], "success": True, "result": res}) + "\\n")
        sys.stdout.flush()
    except Exception as e:
        sys.stdout.write(json.dumps({"type": "res", "id": req.get("id"), "success": False, "error": str(e)}) + "\\n")
        sys.stdout.flush()
`;

    this.child = spawn(python, ["-u", "-c", script, this.filePath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONPATH: path.join(process.cwd(), "substrate", "base")
      }
    });

    this.child.stdout?.on("data", (data) => {
      this.buffer += data.toString();
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.trim()) {
          try {
            this.handleMessage(JSON.parse(line));
          } catch (_) {}
        }
      }
    });

    this.child.stderr?.on("data", (data) => {
      console.error(`[PolyglotBridge Error: ${this.moduleId}]`, data.toString());
    });
  }

  private async handleMessage(msg: any) {
    if (msg.type === "res") {
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        if (msg.success) p.resolve(msg.result);
        else p.reject(new Error(msg.error));
      }
    } else if (msg.type === "req") {
      try {
        const target = this.registry.get(msg.module);
        const res = await target[msg.method](...msg.args);
        this.child?.stdin?.write(
          JSON.stringify({ type: "res", id: msg.id, success: true, result: res }) + "\n"
        );
      } catch (e: any) {
        this.child?.stdin?.write(
          JSON.stringify({ type: "res", id: msg.id, success: false, error: e.message }) + "\n"
        );
      }
    } else if (msg.type === "event") {
      const bus = this.registry.get("EventBus.service");
      if (bus) bus.emit(msg.event, msg.payload);
    }
  }

  call(method: string, args: any[]): Promise<any> {
    this.ensureStarted();
    return new Promise((resolve, reject) => {
      const id = `call-${Date.now()}-${Math.random()}`;
      this.pending.set(id, { resolve, reject });
      this.child?.stdin?.write(
        JSON.stringify({ type: "call", id, method, args }) + "\n"
      );
    });
  }

  dispose() {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
    this.pending.clear();
  }
}
