// ──────────────────────────────────────────────────────────────────
// File:    Router.service.js
// Version: 5.0.1
// Updated: 2026-07-13T00:00:00Z
// Changes: SDOA manifest-compliance pass — added capabilities,
//          dependencies, and last_modified fields.
// ──────────────────────────────────────────────────────────────────
// Last modified: 2026-07-13 00:00 UTC
// Router.service.js — SDOA v5.0 Service (Universal)
// Validated by: ProbationOfficer.workflow.rs
//
// Change log:
//   5.0.0 — Initial implementation. Auto-discovering IPC message dispatcher.
//            The backend spine. Converts incoming snake_case message types to
//            PascalCase workflow IDs and dispatches — no switch statements,
//            no manual registration. Creating a workflow file IS the
//            registration step.
//
//            Express lanes: read-only, low-cost operations bypass the main
//            middleware stack and return immediately with near-zero overhead.
//
//            Middleware stack: logging → auth → rate-limit → dispatch.
//            Each middleware declares itself in its MANIFEST; Router
//            discovers and orders them automatically.

"use strict";

const ResponseFormatter = require("./ResponseFormatter.service");

class RouterService {
  static MANIFEST = {
    // ── Identity ──────────────────────────────
    id:              "Router.service",
    type:            "service",
    layer:           3,
    runtime:         "Universal",
    version:         "5.0.1",
    operationalRole: "savant",

    // ── Dependencies ──────────────────────────
    requires:  ["ResponseFormatter.service", "Chronicle.service"],
    capabilities: [
      "routing:autoDiscovery",
      "routing:middlewareStack",
      "routing:expressLanes",
      "routing:manualRegistration"
    ],
    dependencies: ["ResponseFormatter.service", "Chronicle.service"],
    dataFiles: [],

    // ── Lifecycle ─────────────────────────────
    lifecycle: ["init", "run", "dispose"],

    // ── Action Surface ────────────────────────
    actions: {
      commands: {
        dispatchMessage: {
          description: "Route an incoming IPC message to the correct workflow. msg.type must be snake_case.",
          input:  { msg: "object" },   // { type: string, payload: object, meta?: object }
          output: "object"             // ResponseFormatter result
        },
        register: {
          description: "Manually register a workflow instance under an explicit message type.",
          input:  { msgType: "string", workflow: "object" },
          output: "void"
        },
        unregister: {
          description: "Remove a manually registered workflow binding.",
          input:  { msgType: "string" },
          output: "void"
        },
        listRoutes: {
          description: "Return all currently registered route bindings.",
          input:  {},
          output: "object[]"
        },
        addMiddleware: {
          description: "Push a middleware function onto the stack. Runs before dispatch.",
          input:  { name: "string", fn: "object", order: "number?" },
          output: "void"
        },
        addExpressType: {
          description: "Mark a message type as an express-lane route — bypasses middleware.",
          input:  { msgType: "string" },
          output: "void"
        }
      },
      events: {
        "router:dispatched": {
          payload: { msgType: "string", workflowId: "string", durationMs: "number", success: "boolean" }
        },
        "router:notFound": {
          payload: { msgType: "string" }
        },
        "router:middlewareError": {
          payload: { msgType: "string", middlewareName: "string", error: "string" }
        }
      },
      accepts: {
        "registry:moduleRegistered": {
          description: "Triggers a route table rebuild when a new module joins."
        },
        "scaffold:moduleGenerated": {
          description: "Triggers a route table rebuild when Scaffold drops a new workflow."
        }
      },
      slots: {}
    },

    docs: {
      description: "Auto-discovering IPC message dispatcher — the backend spine. Converts incoming snake_case message types (e.g. 'fetch_users') to PascalCase workflow IDs ('FetchUsers.workflow') and dispatches with no manual registration. Supports a configurable middleware stack (logging, auth, rate-limiting) and express lanes for read-only operations that bypass middleware entirely.",
      author: "ProtoAI Core Architecture Group",
      sdoa:   "5.0.0"
    },
    last_modified: "2026-07-13T00:00:00Z"
  };

  // ── Express lane types (bypass middleware) ─────────────────────
  _EXPRESS_TYPES = new Set([
    "registry_manifest_dump",
    "oracle_dump_surface",
    "oracle_query",
    "oracle_describe_module",
    "pulse_get_report",
    "testcore_list_suites",
    "testcore_get_last_report",
    "cartographer_build_graph",
    "chronicle_get_entry",
    "sentinel_get_report",
    "prism_list_maps",
    "scaffold_list_templates",
    "router_list_routes"
  ]);

  // ── Private State ─────────────────────────────────────────────
  _registry    = null;
  _chronicle   = null;
  _routeTable  = new Map();   // msgType → workflowId (auto-discovered)
  _manualRoutes = new Map();  // msgType → workflow instance (manual)
  _middleware  = [];          // [{ name, fn, order }] sorted ascending
  _busUnsub    = [];

  // ── Lifecycle ──────────────────────────────────────────────────

  async init(registry) {
    this._registry  = registry;
    this._chronicle = registry.get("Chronicle.service");
    this._buildRouteTable();
  }

  async run() {
    this._subscribeEventBus();
    return {
      status:     "ready",
      routeCount: this._routeTable.size + this._manualRoutes.size,
      expressLaneCount: this._EXPRESS_TYPES.size
    };
  }

  async dispose() {
    this._unsubscribeEventBus();
    this._routeTable.clear();
    this._manualRoutes.clear();
    this._middleware = [];
  }

  // ── Core Dispatch ──────────────────────────────────────────────

  async dispatchMessage(msg) {
    const { type: msgType, payload = {}, meta = {} } = msg ?? {};
    if (!msgType) return ResponseFormatter.fail("Router: `msg.type` is required.");

    const t0 = Date.now();
    const isExpress = this._EXPRESS_TYPES.has(msgType);

    // ── Middleware (skip for express lanes) ────────────────────
    if (!isExpress) {
      for (const mw of this._middleware) {
        try {
          const result = await mw.fn({ msgType, payload, meta });
          // Middleware may return a ResponseFormatter result to short-circuit
          if (result && result.__sdoa_response) return result;
        } catch (err) {
          this._emit("router:middlewareError", {
            msgType, middlewareName: mw.name, error: err.message
          });
          return ResponseFormatter.fail(`Router: Middleware "${mw.name}" error — ${err.message}`);
        }
      }
    }

    // ── Resolve workflow ───────────────────────────────────────
    let workflow = this._manualRoutes.get(msgType);

    if (!workflow) {
      const workflowId = this._toWorkflowId(msgType);
      workflow = this._registry?.get?.(workflowId) ?? null;

      if (!workflow) {
        this._emit("router:notFound", { msgType });
        this._chronicle?.record({
          type: "router:notFound", source: "Router.service", payload: { msgType }
        });
        return ResponseFormatter.fail(`Router: No handler for "${msgType}"`);
      }
    }

    // ── Dispatch ───────────────────────────────────────────────
    let result;
    try {
      result = await workflow.run(payload, meta);
    } catch (err) {
      const durationMs = Date.now() - t0;
      this._emit("router:dispatched", {
        msgType, workflowId: workflow?.MANIFEST?.id ?? msgType,
        durationMs, success: false
      });
      this._chronicle?.record({
        type: "router:error", source: "Router.service",
        payload: { msgType, error: err.message, durationMs }
      });
      return ResponseFormatter.fail(`Router: Workflow threw — ${err.message}`);
    }

    const durationMs = Date.now() - t0;
    this._emit("router:dispatched", {
      msgType, workflowId: workflow?.MANIFEST?.id ?? msgType,
      durationMs, success: true
    });

    if (!isExpress) {
      this._chronicle?.record({
        type: `command:${msgType}`, source: "Router.service",
        payload: { msgType, durationMs }
      });
    }

    return result ?? ResponseFormatter.ok(null);
  }

  // ── Public Commands ────────────────────────────────────────────

  register({ msgType, workflow }) {
    if (!msgType || !workflow) throw new Error("Router.register: `msgType` and `workflow` required.");
    this._manualRoutes.set(msgType, workflow);
  }

  unregister({ msgType }) {
    this._manualRoutes.delete(msgType);
  }

  listRoutes() {
    const auto = [...this._routeTable.entries()].map(([type, id]) => ({
      msgType: type, workflowId: id, source: "auto", express: this._EXPRESS_TYPES.has(type)
    }));
    const manual = [...this._manualRoutes.entries()].map(([type, wf]) => ({
      msgType: type, workflowId: wf?.MANIFEST?.id ?? "(unknown)", source: "manual",
      express: this._EXPRESS_TYPES.has(type)
    }));
    return [...auto, ...manual].sort((a, b) => a.msgType.localeCompare(b.msgType));
  }

  addMiddleware({ name, fn, order = 50 }) {
    this._middleware.push({ name, fn, order });
    this._middleware.sort((a, b) => a.order - b.order);
  }

  addExpressType({ msgType }) {
    this._EXPRESS_TYPES.add(msgType);
  }

  // ── Route Table ────────────────────────────────────────────────

  _buildRouteTable() {
    this._routeTable.clear();
    if (!this._registry) return;

    const modules = typeof this._registry.getAll === "function"
      ? this._registry.getAll()
      : Object.values(this._registry._modules ?? {});

    for (const mod of modules) {
      const manifest = mod?.MANIFEST ?? mod;
      if (!manifest?.id) continue;

      // Map all module types that expose a run() command
      const hasRun = manifest.actions?.commands?.run != null
                  || typeof mod.run === "function";

      if (hasRun) {
        const msgType = this._toMsgType(manifest.id);
        this._routeTable.set(msgType, manifest.id);

        // Also register each declared command as its own route
        for (const cmdName of Object.keys(manifest.actions?.commands ?? {})) {
          if (cmdName === "run") continue;
          const cmdType = `${msgType}_${this._camelToSnake(cmdName)}`;
          this._routeTable.set(cmdType, manifest.id);
        }
      }
    }
  }

  // ── Type Conversion ────────────────────────────────────────────

  _toWorkflowId(msgType) {
    const pascal = msgType
      .split("_")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join("");

    const suffixes = ["workflow", "service", "repository", "adapter"];
    for (const suffix of suffixes) {
      const id = `${pascal}.${suffix}`;
      if (this._registry?.get?.(id)) return id;
    }

    return `${pascal}.workflow`; // fallback — will 404 if not found
  }

  _toMsgType(moduleId) {
    const base = moduleId.replace(/\.(workflow|service|repository|adapter|feature|primitive)$/, "");
    return this._camelToSnake(base);
  }

  _camelToSnake(str) {
    return str
      .replace(/([A-Z])/g, c => `_${c.toLowerCase()}`)
      .replace(/^_/, "")
      .toLowerCase();
  }

  // ── EventBus ──────────────────────────────────────────────────

  _subscribeEventBus() {
    const bus = this._getBus();
    if (!bus) return;

    const rebuild = () => this._buildRouteTable();
    bus.on("registry:moduleRegistered", rebuild);
    bus.on("scaffold:moduleGenerated",  rebuild);
    this._busUnsub.push(
      () => bus.off?.("registry:moduleRegistered", rebuild),
      () => bus.off?.("scaffold:moduleGenerated",  rebuild)
    );
  }

  _unsubscribeEventBus() {
    this._busUnsub.forEach(fn => fn());
    this._busUnsub = [];
  }

  _getBus() {
    return this._registry?.get?.("EventBus.service")
        ?? (typeof window !== "undefined" ? window.EventBus : null);
  }

  _emit(eventName, payload) {
    try { this._getBus()?.emit?.(eventName, payload); } catch (_) {}
  }
}

module.exports = RouterService;
