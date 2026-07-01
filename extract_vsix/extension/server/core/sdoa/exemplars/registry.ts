// Last modified: 2026-06-09 08:35 UTC
// registry.ts — SDOAv5.0 Service Registry

import { PolyglotBridge } from "./polyglot";

export interface SdoaManifest {
  id: string;
  type: "primitive" | "feature" | "adapter" | "service" | "workflow" | "repository" | "task" | "engine" | "utility";
  layer: number;
  runtime: "Browser" | "NodeJS" | "Universal" | "Wasm" | "Python" | "Rust";
  version: string;
  requires?: string[];
  capabilities?: string[];
  dependencies?: string[];
  dataFiles?: string[];
  lifecycle?: string[];
  actions?: {
    commands?: Record<string, any>;
    events?: Record<string, any>;
    accepts?: Record<string, any>;
    slots?: Record<string, any>;
  };
  backendDeps?: any[];
  operationalRole?: "registrar" | "captain" | "conductor" | "coach" | "probation-officer" | "assembly-line" | "triage" | "savant";
  optimization?: {
    priority: "speed" | "safety" | "readability" | "memory-footprint";
    assertionSuite: string;
  };
  docs?: {
    description: string;
    author: string;
    sdoa: string;
  };
}

export interface SdoaModuleClass {
  MANIFEST: SdoaManifest;
  new (...args: any[]): any;
}

export class Registry {
  static MANIFEST: SdoaManifest = {
    id: "Registry.service",
    type: "service",
    layer: 3,
    runtime: "NodeJS",
    version: "5.0.0",
    capabilities: ["module_registration", "wasm_invocation", "proxy_interception"],
    lifecycle: ["init"],
    actions: {
      commands: {
        register: { description: "Register JS Module class", input: { moduleClass: "SdoaModuleClass" }, output: "void" },
        registerPolyglot: { description: "Register Polyglot module (Python/Rust)", input: { manifest: "SdoaManifest", filePath: "string" }, output: "void" },
        get: { description: "Get module instance by ID", input: { id: "string" }, output: "any" }
      }
    },
    docs: { description: "Dynamic system registry and Wasm/Polyglot router.", author: "ProtoAI team", sdoa: "5.0.0" }
  };

  private modules = new Map<string, any>();
  private classes = new Map<string, any>();
  private listeners: ((event: any) => void)[] = [];

  constructor() {
    this.modules.set("Registry.service", this);
    this.classes.set("Registry.service", { MANIFEST: Registry.MANIFEST });
  }

  async init(): Promise<void> {}

  subscribe(callback: (event: any) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  broadcast(event: any): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (_) {}
    }
  }

  register(moduleClass: SdoaModuleClass): void {
    const manifest = moduleClass.MANIFEST;
    if (this.modules.has(manifest.id)) return;
    this.classes.set(manifest.id, moduleClass);
    this.modules.set(manifest.id, new moduleClass(this));
    this.broadcast({ type: "module-registered", moduleId: manifest.id, manifest });
  }

  registerPolyglot(manifest: SdoaManifest, filePath: string): void {
    if (this.modules.has(manifest.id)) return;
    this.classes.set(manifest.id, { MANIFEST: manifest });
    this.modules.set(manifest.id, new PolyglotBridge(manifest.id, filePath, this));
    this.broadcast({ type: "module-registered", moduleId: manifest.id, manifest });
  }

  async registerWasm(manifest: SdoaManifest, wasmBuffer: ArrayBuffer | Uint8Array, importObject: WebAssembly.Imports = {}): Promise<void> {
    const compiled = (await WebAssembly.instantiate(wasmBuffer, importObject)) as any;
    this.classes.set(manifest.id, { MANIFEST: manifest });
    this.modules.set(manifest.id, compiled.instance ? compiled.instance.exports : compiled.exports);
    this.broadcast({ type: "module-registered", moduleId: manifest.id, manifest });
  }

  get<T = any>(id: string): T {
    const instance = this.modules.get(id);
    if (!instance) {
      throw new Error(`SDOA Error: Module '${id}' is not registered.`);
    }
    if (id === "Registry.service") return instance as T;

    const self = this;
    return new Proxy(instance, {
      get(target, prop, receiver) {
        if (typeof prop !== "string") {
          return Reflect.get(target, prop, receiver);
        }

        // Auto-wrap proxy calls for PolyglotBridge
        if (target instanceof PolyglotBridge) {
          return (...args: any[]) => target.call(prop, args);
        }

        const val = Reflect.get(target, prop, receiver);
        if (typeof val === "function") {
          return function (...args: any[]) {
            const t0 = Date.now();
            self.broadcast({ type: "call-start", moduleId: id, commandName: prop, timestamp: t0 });
            try {
              const res = val.apply(target, args);
              if (res instanceof Promise) {
                return res.then(
                  (resolvedVal) => {
                    self.broadcast({ type: "call-end", moduleId: id, commandName: prop, success: true, duration: Date.now() - t0 });
                    return resolvedVal;
                  },
                  (err) => {
                    self.broadcast({ type: "call-end", moduleId: id, commandName: prop, success: false, error: String(err), duration: Date.now() - t0 });
                    throw err;
                  }
                );
              }
              self.broadcast({ type: "call-end", moduleId: id, commandName: prop, success: true, duration: Date.now() - t0 });
              return res;
            } catch (err) {
              self.broadcast({ type: "call-end", moduleId: id, commandName: prop, success: false, error: String(err), duration: Date.now() - t0 });
              throw err;
            }
          };
        }
        return val;
      }
    }) as T;
  }

  getManifest(id: string): SdoaManifest {
    const cls = this.classes.get(id);
    if (!cls) {
      throw new Error(`SDOA Error: Manifest for module '${id}' not found.`);
    }
    return cls.MANIFEST;
  }

  getAll(): any[] {
    return Array.from(this.modules.values());
  }

  getAllRegisteredModules(): string[] {
    return Array.from(this.modules.keys());
  }

  async initAll(): Promise<void> {
    for (const [id, instance] of this.modules.entries()) {
      if (instance && typeof instance.init === "function") {
        await instance.init(this);
      }
    }
  }

  async disposeAll(): Promise<void> {
    for (const [, instance] of this.modules.entries()) {
      if (instance && typeof instance.dispose === "function") {
        await instance.dispose();
      }
    }
  }
}
