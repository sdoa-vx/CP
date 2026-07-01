"use strict";

/**
 * lifecycle.js — SDOA Module Lifecycle Rules
 *
 * Extracted from: SDOA-Whitepaper-Technical.txt Sections 11, 20,
 * SDOA-Governance-Outline.txt Sections 4, 6, sdoa-linter.js / linter.ts,
 * sdoa-base.js (SdoaModule, Service, Adapter base classes),
 * authorities/conductor/index.ts (initAll() sequencing),
 * substrate/workflows/TestCore.workflow.ts (run/dispose),
 * Registry.service.ts (initAll() dependency order)
 */

const LIFECYCLE_RULES = {

  // ─── Frontend Lifecycle (UI Modules) ──────────────────────────────────────
  FRONTEND_LIFECYCLE: {
    description: "The five-method lifecycle contract for all UI modules (Layer 1 features and Layer 2 primitives)",
    methods:     ["init", "mount", "update", "unmount", "destroy"],
    order:       "init → mount → [update*] → unmount → destroy",
    required:    true,
    rules: {
      init: {
        description: "Module initialization. Setup internal state, register global event listeners. Do NOT touch the DOM.",
        rule:        "init() MUST NOT manipulate the DOM. The container element does not exist yet at init() time.",
        async:       "May be async. Must complete before mount() is called.",
        forbidden:   ["DOM manipulation", "setTimeout() (use proper async/await sequencing)", "window.* global state"]
      },
      mount: {
        description: "Render into the DOM. Receives the container element. This is where DOM work happens.",
        rule:        "mount(container) receives the container element as a parameter. Renders the module's UI into that container.",
        async:       "May be async.",
        must_do:     ["Attach all DOM event listeners needed by this mount", "Render the initial UI state"]
      },
      update: {
        description: "Re-render in response to state changes.",
        rule:        "Called whenever the module needs to re-render. Must be idempotent — calling update() multiple times must not break state.",
        optional:    false,
        pattern:     "Re-render only changed portions if possible."
      },
      unmount: {
        description: "Undo everything mount() did. Remove all listeners added in mount().",
        rule:        "unmount() MUST remove every event listener that mount() added. Failure to do so causes ghost listeners that accumulate over time.",
        symmetry:    "unmount is the symmetric inverse of mount. For every addEventListener in mount, there must be a removeEventListener in unmount.",
        forbidden:   ["Leaving event listeners attached", "Leaving DOM mutations in place without cleanup"]
      },
      destroy: {
        description: "Undo everything init() did. Full teardown.",
        rule:        "destroy() MUST remove every event listener that init() registered. Must be called AFTER unmount(). Frees all resources.",
        symmetry:    "destroy is the symmetric inverse of init.",
        order_rule:  "destroy() must only be called after unmount() has been called. Calling destroy() on a mounted module leaves the DOM in a broken state."
      }
    },
    ghost_listener_rule: "If init() registers a global event listener (e.g., window.addEventListener), it MUST be removed in destroy(). If mount() registers a listener, it MUST be removed in unmount(). Forgetting one creates a ghost listener that persists after the module is removed and accumulates on repeated mount/unmount cycles.",
    linter_check: "The linter checks that .feature.js files declare both 'mount' and 'unmount'. Missing either is an error."
  },

  // ─── Backend Lifecycle (Layer 3 Modules) ──────────────────────────────────
  BACKEND_LIFECYCLE: {
    description: "The three-method lifecycle contract for backend modules (services, adapters, workflows, repositories)",
    methods:     ["init", "run", "dispose"],
    order:       "init → run → dispose",
    required:    true,
    rules: {
      init: {
        description: "Initialize resources, open connections, load config. Called once at startup.",
        rule:        "init() MUST NOT use setTimeout() as a poor man's async wait. Use proper async/await.",
        async:       "Must be async. Returns a promise. Registry.initAll() awaits it.",
        forbidden:   ["setTimeout() inside init()", "Circular dependency invocations"]
      },
      run: {
        description: "Execute the module's primary operation. Called by the Router on incoming IPC messages.",
        rule:        "run() receives the IPC message payload. Returns a ResponseFormatter-shaped response: { ok: true, data } or { ok: false, error }.",
        return_shape: "{ ok: boolean, data?: any, error?: string }"
      },
      dispose: {
        description: "Tear down resources opened in init(). Called at shutdown.",
        rule:        "dispose() MUST clean up all resources: close DB connections, clear timers (_timers.forEach(clearTimeout)), remove event listeners registered in init().",
        timer_cleanup: "All setTimeout handles stored in this._timers must be cleared: this._timers.forEach(id => clearTimeout(id)); this._timers = [];"
      }
    },
    init_order: {
      description: "Registry.service.ts initAll() calls init() in dependency order",
      rule:        "A module is not initialized until all its declared dependencies (requires[]) are initialized first. Circular dependencies will cause initAll() to loop.",
      exception:   "The virtual dependency 'Types' is not validated (it is a compile-time concept, not a runtime module)."
    }
  },

  // ─── Module States ────────────────────────────────────────────────────────
  MODULE_STATES: {
    description: "The valid operational states a module can be in",
    states: [
      {
        state:       "pending",
        description: "Module has been scaffolded or declared but not yet initialized. Gate 1 state.",
        transitions: ["initializing"]
      },
      {
        state:       "initializing",
        description: "Module's init() is currently executing.",
        transitions: ["active", "error"]
      },
      {
        state:       "active",
        description: "Module has been initialized and is ready to receive calls.",
        transitions: ["disposed", "error"]
      },
      {
        state:       "error",
        description: "Module's init() failed or an unhandled exception occurred during run().",
        transitions: ["pending"]
      },
      {
        state:       "disposed",
        description: "Module has been torn down. dispose() has been called.",
        transitions: []
      }
    ]
  },

  // ─── Probation State (Registrar Pipeline) ─────────────────────────────────
  PROBATION_STATES: {
    description: "Additional states used by the Registrar's two-tier ingestion pipeline",
    states: [
      {
        state:       "probation",
        description: "Module has passed ProbationOfficer static analysis. Awaiting portfolio acceptance.",
        condition:   "ProbationOfficer.workflow has run and found no violations."
      },
      {
        state:       "champion",
        description: "Module has been selected as the winning variant by Registrar arbitration.",
        condition:   "When multiple variants compete for the same functional identity, the highest-scoring one becomes champion."
      },
      {
        state:       "deposed",
        description: "Module was previously champion but has been replaced by a higher-scoring variant.",
        condition:   "A new variant with higher SemVer score or optimization priority has taken the champion slot."
      }
    ]
  },

  // ─── SdoaModule Base Class Lifecycle ─────────────────────────────────────
  BASE_CLASS_LIFECYCLE: {
    description: "Lifecycle methods inherited from SdoaModule base class (environment/sdoa-base.js)",
    inherited_methods: {
      emit: {
        description: "Publishes an event to the EventBus using the module's id as namespace",
        signature:   "emit(event, payload) — broadcasts '{id}:{event}' to EventBus"
      },
      bump_patch: {
        description: "Increments the patch version in this module's MANIFEST.version (e.g., 1.0.4 → 1.0.5)",
        rule:        "Call after every change to comply with Gate 4 (Micro-Incrementation)"
      },
      bump_minor: {
        description: "Increments the minor version and resets patch (e.g., 1.0.5 → 1.1.0)",
        rule:        "Call when adding new functionality without breaking existing behavior"
      },
      bump_major: {
        description: "Increments the major version and resets minor.patch (e.g., 1.1.5 → 2.0.0)",
        rule:        "Call when making breaking changes to the module's public API"
      }
    },
    subclasses_js: ["Service", "Adapter", "Task", "Component"],
    subclasses_ts:  ["Service", "Adapter", "Task", "Component", "Engine", "Primitive", "Feature"]
  },

  // ─── Conductor Circuit Breaker States ────────────────────────────────────
  CONDUCTOR_STATES: {
    description: "Event circuit breaker states managed by Conductor.service.js",
    states: [
      {
        state:       "CLOSED",
        description: "Normal operating state. Events flow freely.",
        transition:  "→ OPEN when rate cap exceeded or manual suppressEvent() called"
      },
      {
        state:       "OPEN",
        description: "Circuit is open. Events are suppressed/dropped for this event type.",
        transition:  "→ HALF_OPEN after suppression timer expires"
      },
      {
        state:       "HALF_OPEN",
        description: "Testing recovery. A single event is allowed through to test stability.",
        transition:  "→ CLOSED if no cascade detected; → OPEN if cascade detected"
      }
    ],
    operations: {
      suppressEvent:  "Suppress a specific event type. Opens the circuit.",
      breakChain:     "Emergency circuit break — stops all events of a given type from propagating.",
      setRateCap:     "Set maximum events per time window for an event type before OPEN state triggers."
    }
  }
};

module.exports = { LIFECYCLE_RULES };
