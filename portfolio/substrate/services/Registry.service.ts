// ──────────────────────────────────────────────────────────────────
// File:    Registry.service.ts
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure (substrate copy)
// ──────────────────────────────────────────────────────────────────
// ============================================================
// Registry.service.ts — SDOA v5.0 Service
// version: 5.0.0
// Last modified: 2026-06-03 05:10 UTC
// ============================================================

import { PolyglotBridge } from "./PolyglotBridge";

export interface SdoaManifest {
  id: string;
  type: 'primitive' | 'feature' | 'adapter' | 'service' | 'workflow' | 'repository' | 'task' | 'engine';
  layer: number;
  runtime: 'Browser' | 'NodeJS' | 'Universal' | 'Wasm' | 'Python' | 'Rust';
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
  operationalRole?: 'registrar' | 'captain' | 'conductor' | 'coach' | 'probation-officer' | 'assembly-line' | 'triage' | 'savant';
  optimization?: {
    priority: 'speed' | 'safety' | 'readability' | 'memory-footprint';
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
    operationalRole: "registrar",
    requires: [],
    capabilities: ["module_registration", "wasm_invocation", "polyglot_registration", "proxy_interception"],
    dependencies: [],
    lifecycle: ["init"],
    actions: {
      commands: {
        register: { description: "Register SDOA Module class", input: { moduleClass: "SdoaModuleClass" }, output: "void" },
        registerWasm: { description: "Register WebAssembly module", input: { manifest: "SdoaManifest", wasmBuffer: "Buffer" }, output: "Promise<void>" },
        registerPolyglot: { description: "Register Polyglot module (Python/Rust) via PolyglotBridge", input: { manifest: "SdoaManifest", filePath: "string" }, output: "void" },
        get: { description: "Get module instance by ID", input: { id: "string" }, output: "any" }
      }
    },
    optimization: {
      priority: "readability",
      assertionSuite: ""
    },
    docs: {
      description: "Auto-discovering system registry, service lifecycle coordinator, and Wasm container.",
      author: "ProtoAI team",
      sdoa: "5.0.0"
    }
  };

  private modules = new Map<string, any>();
  private classes = new Map<string, SdoaModuleClass | { MANIFEST: SdoaManifest }>();
  private listeners: ((event: any) => void)[] = [];

  constructor() {
    this.modules.set("Registry.service", this);
    this.classes.set("Registry.service", { MANIFEST: Registry.MANIFEST });
  }

  async init(): Promise<void> {
    // Self-init
  }

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
      } catch (err) {
        // Suppress listener errors
      }
    }
  }

  register(moduleClass: SdoaModuleClass): void {
    const manifest = moduleClass.MANIFEST;
    this.validateManifest(manifest);

    if (this.modules.has(manifest.id)) {
      throw new Error(`SDOA Error: Module with ID '${manifest.id}' is already registered.`);
    }

    this.classes.set(manifest.id, moduleClass);
    this.modules.set(manifest.id, new moduleClass());

    this.broadcast({
      type: 'module-registered',
      moduleId: manifest.id,
      manifest
    });
  }

  // Register a Polyglot (Python/Rust) module — calls route through PolyglotBridge.
  // Merged in from the legacy Polyglot Registry variant; keeps this registry's
  // validation + dup-protection (the variant silently no-op'd on dup).
  registerPolyglot(manifest: SdoaManifest, filePath: string): void {
    this.validateManifest(manifest);

    if (this.modules.has(manifest.id)) {
      throw new Error(`SDOA Error: Module with ID '${manifest.id}' is already registered.`);
    }

    this.classes.set(manifest.id, { MANIFEST: manifest });
    this.modules.set(manifest.id, new PolyglotBridge(manifest.id, filePath, this));

    this.broadcast({
      type: 'module-registered',
      moduleId: manifest.id,
      manifest
    });
  }

  async registerWasm(manifest: SdoaManifest, wasmBuffer: Buffer, importObject: WebAssembly.Imports = {}): Promise<void> {
    this.validateManifest(manifest);

    if (this.modules.has(manifest.id)) {
      throw new Error(`SDOA Error: Module with ID '${manifest.id}' is already registered.`);
    }

    // Instantiates WASM bytes dynamically and binds exports
    const compiled = (await WebAssembly.instantiate(wasmBuffer, importObject)) as any;

    this.classes.set(manifest.id, { MANIFEST: manifest });
    this.modules.set(manifest.id, compiled.instance.exports);

    this.broadcast({
      type: 'module-registered',
      moduleId: manifest.id,
      manifest
    });
  }

  private validateManifest(manifest: SdoaManifest): void {
    if (!manifest) {
      throw new Error(`SDOA Error: Missing MANIFEST in module.`);
    }

    const required: (keyof SdoaManifest)[] = ["id", "type", "version", "runtime", "layer"];
    for (const field of required) {
      if (manifest[field] === undefined) {
        throw new Error(`SDOA Validation Error: Module is missing required field '${field}' in manifest.`);
      }
    }
  }

  // Force re-register a module (Hot Swap)
  reregister(moduleClass: SdoaModuleClass): void {
    const manifest = moduleClass.MANIFEST;
    this.validateManifest(manifest);
    this.classes.set(manifest.id, moduleClass);
    this.modules.set(manifest.id, new moduleClass());

    this.broadcast({
      type: 'module-registered',
      moduleId: manifest.id,
      manifest
    });
  }

  get<T = any>(id: string): T {
    const instance = this.modules.get(id);
    if (!instance) {
      throw new Error(`SDOA Error: Module '${id}' is not registered in the system.`);
    }

    if (id === "Registry.service" || typeof instance !== "object" || instance === null) {
      return instance as T;
    }

    const registry = this;
    return new Proxy(instance, {
      get(target, prop, receiver) {
        // Polyglot modules: forward every method call across the bridge.
        if (target instanceof PolyglotBridge && typeof prop === 'string') {
          return (...args: any[]) => (target as any).call(prop, args);
        }
        const val = Reflect.get(target, prop, receiver);
        if (typeof val === 'function' && typeof prop === 'string') {
          return function (...args: any[]) {
            const timestamp = Date.now();
            registry.broadcast({
              type: 'call-start',
              moduleId: id,
              commandName: prop,
              timestamp
            });
            try {
              const res = val.apply(target, args);
              if (res instanceof Promise) {
                return res.then(
                  (resolvedVal) => {
                    registry.broadcast({
                      type: 'call-end',
                      moduleId: id,
                      commandName: prop,
                      success: true,
                      duration: Date.now() - timestamp,
                      timestamp: Date.now()
                    });
                    return resolvedVal;
                  },
                  (rejectedErr) => {
                    registry.broadcast({
                      type: 'call-end',
                      moduleId: id,
                      commandName: prop,
                      success: false,
                      error: rejectedErr instanceof Error ? rejectedErr.message : String(rejectedErr),
                      duration: Date.now() - timestamp,
                      timestamp: Date.now()
                    });
                    throw rejectedErr;
                  }
                );
              } else {
                registry.broadcast({
                  type: 'call-end',
                  moduleId: id,
                  commandName: prop,
                  success: true,
                  duration: Date.now() - timestamp,
                  timestamp: Date.now()
                    });
                return res;
              }
            } catch (err) {
              registry.broadcast({
                type: 'call-end',
                moduleId: id,
                commandName: prop,
                success: false,
                error: err instanceof Error ? err.message : String(err),
                duration: Date.now() - timestamp,
                timestamp: Date.now()
              });
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
      throw new Error(`SDOA Error: Manifest for module '${id}' is not found.`);
    }
    return cls.MANIFEST;
  }

  getAllRegisteredModules(): string[] {
    return Array.from(this.modules.keys());
  }

  // All live module instances (merged in from the Polyglot variant's getAll()).
  getAll(): any[] {
    return Array.from(this.modules.values());
  }

  async initAll(): Promise<void> {
    // 1. Validate dependencies requires
    for (const [id, value] of this.classes.entries()) {
      const manifest = value.MANIFEST;
      if (manifest.requires) {
        for (const req of manifest.requires) {
          if (!this.modules.has(req) && req !== "Types") {
            throw new Error(`SDOA Graph Error: Module '${id}' requires missing dependency '${req}'.`);
          }
        }
      }
    }

    // 2. Invoke init() on modules that implement it
    for (const [id, instance] of this.modules.entries()) {
      if (instance && typeof instance.init === "function") {
        await instance.init(this);
      }
    }
  }

  async disposeAll(): Promise<void> {
    for (const [id, instance] of this.modules.entries()) {
      if (instance && typeof instance.dispose === "function") {
        await instance.dispose();
      }
    }
  }
}
