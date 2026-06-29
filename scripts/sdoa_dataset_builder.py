#!/usr/bin/env python3
# ──────────────────────────────────────────────────────────────────
# File:    sdoa_dataset_builder.py
# Version: 1.0.0
# Updated: 2026-06-27T00:00:00Z
# Changes: Phase 1 of the SDOA LoRA Fine-Tune Gameplan.
#          Reads canonical SDOA sources from the local project and
#          generates instruction-response training pairs in ShareGPT
#          JSONL format.  Output: scripts/sdoa_training_data/sdoa_dataset.jsonl
# ──────────────────────────────────────────────────────────────────
"""
Usage:
    python scripts/sdoa_dataset_builder.py [--out PATH] [--no-dynamic]

Outputs one JSON object per line (ShareGPT format):
    {"conversations": [
        {"from": "system", "value": "<SDOA constitution>"},
        {"from": "human",  "value": "<instruction>"},
        {"from": "gpt",    "value": "<response>"}
    ]}
"""

import json
import pathlib
import argparse
import textwrap

ROOT     = pathlib.Path(__file__).parent.parent
OUT_DIR  = pathlib.Path(__file__).parent.parent / "datasets"
OUT_FILE = OUT_DIR / "sdoa_lora_dataset.jsonl"

# ── SDOA Constitution (baked-in system prompt) ─────────────────────
SDOA_SYSTEM = textwrap.dedent("""\
    You are an SDOA-native sovereign module analyst. You reason using:
    • SDOA layer model: L1 Features / L2 Primitives / L3 Adapters-Services-Workflows-Sleeves
    • Manifest schema v5.4 (id, type, layer, version, runtime, capabilities, requires, docs,
      operationalRole, optimization; sleeve adds external: { system, transport, path, commands[] })
    • Governance pipeline: Coach → ProbationOfficer → Registrar → Oracle → Cartographer
    • Sleeve lifecycle contract: init() → run({ command, payload }) → dispose()
    • Drift detection: Cartographer ghost nodes, boundary scoring, severity ladder
    • Response shape: { ok: true, data } on success | { ok: false, error } on failure (ResponseFormatter)
    • Naming: Name.type (e.g. Registry.service, Button.prim, QwenSleeve.module)
    • Routing: snake_case IPC type → PascalCase workflow ID; creating the file IS registration

    FORBIDDEN acts you MUST refuse or flag:
    eval(), Function() constructor, fs.writeFileSync to peer modules, hardcoded absolute paths,
    monkey-patching, window.* global state (SR-021), registry mutation, governance-gate bypass,
    layer skipping (L1 → L3 directly, L2 → L1), cross-module internal state mutation (SR-007).

    Always cite the SDOA rule ID (e.g. SR-007, SR-017, Gate 3) when explaining a violation.
""")

# ── Static hand-crafted training pairs ────────────────────────────
# Covers: module types, layer rules, manifest, sovereignty, gates,
# sleeve lifecycle, drift detection, response shape, naming, routing,
# forbidden acts, and SDOA grammar.
STATIC_PAIRS = [

    # ──────────────────────── Module types ──────────────────────────
    {
        "i": "Explain the difference between a service, workflow, engine, adapter, and sleeve in SDOA.",
        "r": textwrap.dedent("""\
            In SDOA all five are Layer 3 types, but with distinct roles:

            **Service** (.service.js/ts) — Long-lived infrastructure reused by many features.
            Lives in substrate/services/ or authorities/*/. Registered by ID; retrieved via
            registry.get("Name.service"). Implements init(), run(), dispose().
            Example: Registry.service, Oracle.service.

            **Workflow** (.workflow.js/ts) — Single-purpose message handler auto-discovered by
            Router. Creating the file IS registration. IPC message type is snake_case of the
            workflow class ID (chat_send → ChatSend.workflow). Must return ResponseFormatter shape.

            **Engine** (.engine.py/.engine.rs etc.) — Polyglot compute engine registered via
            PolyglotBridge. Binary artifacts (.wasm, .bin) live in the engine folder.
            Example: LocalLlmServer.engine.py.

            **Adapter** (.adapter.js/ts) — Bridge between application domain and an external
            system/API/protocol. Lives in substrate/adapters/ (backend) or ui/adapters/ (frontend).
            Declares static MANIFEST with backendDeps[] when bridging IPC calls.

            **Sleeve** (.sleeve.js or .module.js) — v5.4 boundary sovereign (type: "sleeve").
            Wraps an external autonomous system (Ollama, Python HTTP server, Tauri IPC, etc.).
            Layer 3 ONLY. MUST declare external: { system, transport, path, commands[] }.
            Extends SleeveBase. All external output normalized through ResponseFormatter.
        """),
    },
    {
        "i": "What layer does a sleeve module belong to, and what fields must its MANIFEST declare?",
        "r": textwrap.dedent("""\
            A sleeve belongs exclusively to **Layer 3** — never L1 or L2.

            Required MANIFEST fields for a sleeve:
            ```js
            static MANIFEST = {
              id:              "OllamaSDOASleeve.module",  // Name.module convention
              type:            "sleeve",
              layer:           3,                           // always 3
              runtime:         "NodeJS",
              version:         "1.0.0",
              operationalRole: "savant",
              requires:        ["ResponseFormatter.service", "PathResolver.service"],
              capabilities:    ["sdoa-qwen.generate", "sdoa-qwen.health"],
              lifecycle:       ["init", "run", "dispose"],
              external: {
                system:    "ollama-sdoa-qwen",  // ghost-node identity in Cartographer
                transport: "http",              // http | http+spawn | https | polyglot-bridge | node-module | window.__TAURI__
                path:      "auto",              // "auto" = PathResolver discovers it
                commands:  ["generate", "health"]
              },
              optimization: { priority: "readability", assertionSuite: "" },
              last_modified: "2026-06-27T00:00:00Z",
              docs: { description: "...", author: "...", sdoa: "5.4.0" }
            };
            ```

            Forbidden inside any sleeve: eval(), Function(), fs.writeFileSync to peer modules,
            hardcoded absolute paths, raw fetch() when transport=https, monkey-patching.
        """),
    },
    {
        "i": "What is the difference between a workflow and a service in SDOA?",
        "r": textwrap.dedent("""\
            **Workflow** — Single-purpose, message-driven. Router auto-discovers it by converting
            the snake_case IPC message type to PascalCase and finding the matching .workflow.js file.
            Creating the file IS registration — no routing table edit. Workflows implement run(payload)
            and are one-shot per message.

            **Service** — Long-lived infrastructure reused across many requests/features. Registered
            in the registry at boot; retrieved via registry.get("MyService.service"). Persists for
            the lifetime of the process.

            Key distinction: workflow = message-driven, auto-routed, one-shot.
            Service = registry-registered, reused by many callers, long-lived.

            You would write a workflow to handle `chat_send`; you would write a service for
            the EventBus, StateStore, or Oracle itself.
        """),
    },
    {
        "i": "What is a primitive in SDOA and what rules govern it?",
        "r": textwrap.dedent("""\
            A **primitive** is a Layer 2 browser module — a generic, reusable, domain-agnostic UI atom.
            File suffix: .prim.js. Lives in ui/primitives/.

            Rules:
            1. MUST be IIFE-wrapped: (function() { ... })();
            2. MUST use `const MANIFEST` (NOT `static MANIFEST` — that is a SR-008 violation in L2)
            3. MUST call window.ModuleLoader.register(MANIFEST, { init, mount, update, unmount, destroy })
            4. MUST NOT call fetch() (SR-020)
            5. MUST NOT import Layer 1 features or Layer 3 modules (SR-002 / SR-004)
            6. Line target: 250; hard ceiling: 500
            7. May only emit events — never reach into backend

            The 19 canonical SDOA UI primitives:
            Button, Input, Toggle, Select, Panel, Modal, TabGroup, List, Tree, Form,
            Toast, Badge, Toolbar, EmptyState, ScrollMap, CodeEditor, ContextMenu, Spinner, Markdown.
        """),
    },

    # ──────────────────────── Layer rules ───────────────────────────
    {
        "i": "Can a Layer 1 feature call a Layer 3 workflow directly in SDOA?",
        "r": textwrap.dedent("""\
            **No.** This is SR-001 — a hard error detected by the linter via layer check on imports.

            Layer 1 features may ONLY call Layer 2 primitives. Backend calls go through adapters
            declared in the feature's manifest `backendDeps[]` array. The adapter mediates the IPC
            call; the feature never imports or invokes a .workflow.js or .service.js directly.

            Why: Layer traffic rules keep the manifest dependency graph accurate and auto-discovery
            functional. If features bypass adapters, the system cannot validate layer topology.

            Correction: declare the backend operation in `backendDeps[]` and route it through the
            IPC bridge to the appropriate workflow.
        """),
    },
    {
        "i": "Can a primitive call fetch() in SDOA?",
        "r": textwrap.dedent("""\
            **No.** This violates SR-020 and SR-002 (Layer 2 backend call) — a hard error.

            Primitives are domain-agnostic UI atoms. Calling fetch() couples them to specific
            application endpoints, destroying their reusability guarantee.

            The linter detects `fetch(` as a forbidden string in .prim.js files.

            Primitives may ONLY emit events. Backend awareness belongs in Layer 3 adapters or
            Layer 1 features (via adapters), never in primitives.
        """),
    },
    {
        "i": "What is layer skipping in SDOA? Give two examples.",
        "r": textwrap.dedent("""\
            **Layer skipping** is when a module calls a module two or more layers away, bypassing
            the intermediate layer. SR-004 prohibits it.

            **Example 1 — Feature skips to Repository (SR-004):**
            A .feature.js directly requires a .repository.js.
            Correct path: feature → adapter → repository.

            **Example 2 — Primitive skips to Feature (SR-004, reverse):**
            A .prim.js imports a .feature.js.
            Primitives must be unaware of features — features compose primitives, not the reverse.

            Both are detected by the linter's layer check on import/require statements.
            Both produce severity "error" findings.
        """),
    },

    # ──────────────────────── Manifest rules ────────────────────────
    {
        "i": "What are the required fields in an SDOA v5.0 manifest?",
        "r": textwrap.dedent("""\
            **Core required (all versions):**
            id, type, layer, version, runtime

            **v1.2 mandatory additions:**
            capabilities (array), requires/dependencies (array), docs (object with description),
            last_modified (ISO 8601 timestamp, updated on every change)

            **v5.0 additions:**
            operationalRole (one of: registrar, captain, conductor, coach, probation-officer,
            assembly-line, triage, savant, assemblyline, oracle)
            optimization: { priority: "speed|safety|readability|memory-footprint", assertionSuite: "" }

            **v5.4 sleeve addition (when type="sleeve"):**
            external: { system, transport, path, commands[] }

            Valid `type` values: primitive, feature, adapter, service, workflow, repository,
            task, engine, utility, component, dashboard, validator, sleeve

            Valid `runtime` values: Browser, NodeJS, Universal, Wasm, Python, Rust, C++, COBOL, VB
        """),
    },
    {
        "i": "How does manifest syntax differ between Layer 3 (Node.js) and Layer 1/2 (browser) modules?",
        "r": textwrap.dedent("""\
            **Layer 3 (Node.js) — class static property:**
            ```js
            class MyService {
              static MANIFEST = { id: "MyService.service", type: "service", layer: 3, ... };
            }
            module.exports = MyService;
            ```
            TypeScript: `static readonly MANIFEST = { ... };` inside an exported class.

            **Layer 1/2 (browser) — const inside IIFE:**
            ```js
            (function() {
              const MANIFEST = { id: "MyButton.prim", type: "primitive", layer: 2, ... };
              window.ModuleLoader.register(MANIFEST, { init, mount, update, unmount, destroy });
            })();
            ```

            Using `static MANIFEST` in a browser module = SR-008 violation.
            Using `const MANIFEST` in a Layer 3 module = Registry cannot discover it.
            The linter checks for the wrong pattern in each layer.
        """),
    },
    {
        "i": "A manifest has version '2.1.0' but the file header block says Version: 2.0.0. What rule does this violate?",
        "r": textwrap.dedent("""\
            This violates **SR-024 / Gate 3 (Temporal Metadata Headers)**.

            Whenever a file is modified, its header block (File, Version, Updated, Changes) must
            be updated to match the manifest version and the current timestamp.

            The linter performs a header version vs. manifest version comparison. A mismatch
            produces a `warning` severity finding.

            Fix: update the header block to `Version: 2.1.0` and set `Updated` to the current
            ISO 8601 timestamp with a Changes entry describing the modification.

            This also touches **Gate 4 (Micro-Incrementation)**: every file modification must
            increment `version` and update `last_modified` in the manifest.
        """),
    },
    {
        "i": "What do you declare when an SDOA file cannot be made fully manifest-compliant?",
        "r": textwrap.dedent("""\
            Declare `\"non-sdoa-compliant\": true` in the manifest (SR-009).

            SR-009 requires all touched files to have EITHER a valid SDOA v1.2 manifest OR a
            `non-sdoa-compliant: true` declaration. Failing to declare either is itself a violation
            ("undeclared non-compliance") — more severe than acknowledged non-compliance.

            The Registry logs such modules but does not reject them. This allows legacy files,
            third-party shims, and transitional modules to remain without breaking governance.

            ```js
            const MANIFEST = {
              id: "LegacyShim.utility",
              type: "utility",
              layer: 3,
              runtime: "NodeJS",
              version: "1.0.0",
              "non-sdoa-compliant": true,
              docs: { description: "Third-party shim — cannot conform to SDOA manifest rules." }
            };
            ```
        """),
    },
    {
        "i": "Given this manifest, identify all violations:\n{ id: \"DataFetcher\", type: \"service\", layer: 3, runtime: \"NodeJS\", version: \"1\" }",
        "r": textwrap.dedent("""\
            **4 violations found:**

            **V1 — Invalid id format (SR-008)**
            "DataFetcher" is missing the type suffix. SDOA requires Name.type format.
            Correct: "DataFetcher.service"

            **V2 — Invalid version format (SR-008)**
            "1" does not match the required semver pattern \\d+\\.\\d+\\.\\d+.
            Correct: "1.0.0"

            **V3 — Missing v1.2 mandatory fields (SR-008)**
            Missing: capabilities[], requires[], docs (with description), last_modified.

            **V4 — Missing v5.0 mandatory fields (SR-008)**
            Missing: operationalRole, optimization.

            Corrected:
            ```js
            static MANIFEST = {
              id:              "DataFetcher.service",
              type:            "service",
              layer:           3,
              runtime:         "NodeJS",
              version:         "1.0.0",
              operationalRole: "savant",
              requires:        [],
              capabilities:    ["data.fetch"],
              lifecycle:       ["init", "run", "dispose"],
              optimization:    { priority: "readability", assertionSuite: "" },
              last_modified:   "2026-06-27T00:00:00Z",
              docs: { description: "Fetches data from an external source.", sdoa: "5.0.0" }
            };
            ```
        """),
    },

    # ──────────────────────── Governance gates ──────────────────────
    {
        "i": "Describe how a Sleeve passes through the SDOA governance pipeline.",
        "r": textwrap.dedent("""\
            **Coach** → Validates that a sleeve is the correct type for the external system.
            Suggests the external.transport and command set.

            **ProbationOfficer** → Runs SLEEVE_* static analysis rule pack:
            • SLEEVE_NO_EVAL: rejects eval() or Function()
            • SLEEVE_NO_PEER_WRITE: rejects fs.writeFileSync to peer module directories
            • SLEEVE_NO_ABSOLUTE_PATHS: rejects hardcoded C:\\... paths; must use PathResolver
            • SLEEVE_TRANSPORT_GUARD: if transport=https, rejects raw fetch()
            • SLEEVE_RESPONSE_NORMALIZE: enforces ResponseFormatter normalization on all output
            Sleeve line limit: 500 (same as general hard ceiling)

            **Registrar** → Validates external block completeness (all 4 fields required).
            Adds "sleeve" to the type union.

            **Oracle** → Indexes capabilities as {system}.{command} in the capability mesh.
            Exposes whoHasBoundary(system) lookup. Computes boundary health scores.

            **Cartographer** → Draws the amber dashed ghost node for the external system.
            Creates boundary edges sleeve → ghost node (labeled with transport + commands).
            Enables drift detection tracking.
        """),
    },
    {
        "i": "What are the Five Implementation Protocol Gates in SDOA?",
        "r": textwrap.dedent("""\
            **Gate 1 — Pending State**
            Module must be scaffolded and declared "pending" in the registry before implementation
            begins. Building without declaring intent = warning.

            **Gate 2 — Atomic File Delivery**
            Every file modification must be delivered as a complete, self-contained file — not a
            snippet or diff. Partial delivery breaks manifest integrity = error.

            **Gate 3 — Temporal Metadata Headers**
            Every modified file must have its header block updated: File, Version, Updated, Changes.
            Stale headers = error (SR-024).

            **Gate 4 — Micro-Incrementation**
            Every modification must increment version and update last_modified. Silent changes = error.

            **Gate 5 — Declarative Compliance**
            Verify architectural placement, layer compliance, dependency declaration, and lifecycle
            contract BEFORE writing code. Code first, compliance never = error.
        """),
    },
    {
        "i": "What is the role of Oracle in the SDOA governance pipeline?",
        "r": textwrap.dedent("""\
            **Oracle** is the capability mesh indexer (operationalRole: "oracle", Layer 3 service).

            Responsibilities:
            1. **Capability indexing** — Reads capabilities[] from each manifest and builds
               a searchable map: capability → [moduleId, ...].
            2. **Sleeve indexing** — For sleeves, indexes {external.system}.{command} entries
               and exposes whoHasBoundary(system) lookup.
            3. **Boundary scoring** — Computes health scores for external systems based on
               sleeve health check telemetry.
            4. **Cross-module queries** — Modules ask Oracle "who can do X?" instead of
               importing each other, enabling genuine runtime decoupling.

            Oracle sits after Registrar in the pipeline (…→ Registrar → Oracle → Cartographer).
            Modules must be Registrar-validated before Oracle indexes them.
        """),
    },
    {
        "i": "What is the role of Cartographer in SDOA?",
        "r": textwrap.dedent("""\
            **Cartographer** is the topology mapper workflow (last stage in the governance pipeline).

            Responsibilities:
            1. **Ghost nodes** — For each sleeve, draws an amber dashed node representing the
               external autonomous system. Ghost nodes appear in blueprint.schema.json.
            2. **Boundary edges** — Draws edges: sleeve module → ghost node, labeled with
               transport type and command list.
            3. **Drift detection** — Tracks changes to sleeve external blocks over time.
               When a sleeve's system, transport, path, or commands change, or the external
               system becomes unreachable, Cartographer logs boundary drift events.
            4. **Blueprint generation** — Produces the machine-readable topology JSON that
               visualization tools use to render the full dependency graph.
        """),
    },

    # ──────────────────────── Sleeve lifecycle ──────────────────────
    {
        "i": "Describe the lifecycle of an SDOA v5.4 Sleeve module.",
        "r": textwrap.dedent("""\
            A Sleeve follows the L3 backend lifecycle — **init → run → dispose** — with SleeveBase
            enforcing specific guarantees at each phase:

            **init(registry)**
            • Retrieves ResponseFormatter.service, PathResolver.service, Triage.workflow from registry
            • Resolves external path via PathResolver (never raw strings)
            • Runs _healthCheck() — if it throws, sleeve marks unhealthy and emits
              sleeve:healthCheckFailed (non-fatal; sleeve still registers, just marked unhealthy)

            **run({ command, payload })**
            • Validates command ∈ external.commands[] → { ok: false, error } if not allowed
            • Delegates to _callExternal(command, payload) (subclass implements)
            • Normalizes raw result via _normalize() → always returns { ok, data } or { ok: false, error }
            • Emits sleeve:boundaryCall to Triage: { moduleId, command, durationMs, ok }
            • Reports latency sample to Pulse.workflow if available

            **dispose()**
            • Calls _teardown() — subclass cleanup (close sockets, kill spawned processes, etc.)
            • Emits sleeve:disposed: { moduleId }
            • Nulls all registry references

            Key invariant: all external output MUST pass through _normalize(). Raw external
            responses NEVER escape the sleeve boundary unnormalized.
        """),
    },
    {
        "i": "What events does a Sleeve emit and to whom?",
        "r": textwrap.dedent("""\
            Three canonical events via EventBus.service:

            **sleeve:healthCheckFailed** — emitted in init() if external system fails health check.
            Payload: { moduleId, system, error }. Triage monitors this.

            **sleeve:boundaryCall** — emitted after every run() call (success or failure).
            Payload: { moduleId, command, durationMs, ok }. Provides Triage with boundary telemetry.

            **sleeve:disposed** — emitted during dispose(). Payload: { moduleId }.
            Allows Cartographer and Oracle to remove the boundary from live maps.

            Additionally: latency samples are reported directly to Pulse.workflow via
            Pulse.recordSample({ moduleId, commandId, durationMs, success }) — Pulse uses these
            for latency trending and anomaly detection.

            Sleeves never call Triage or Cartographer directly — they emit events and those
            governance modules listen. This preserves sovereignty.
        """),
    },

    # ──────────────────────── Drift detection ───────────────────────
    {
        "i": "How does Cartographer detect boundary drift in SDOA?",
        "r": textwrap.dedent("""\
            Cartographer compares the **declared** state (manifest external block) against
            **observed** state (runtime health checks and capability surface changes).

            **Drift triggers:**
            1. Manifest change — external block diff (system, transport, path, commands).
               Commands added = "boundary expansion"; removed = "boundary contraction".
            2. Health check failure — sustained _healthCheck() failures → ghost node turns degraded.
            3. Capability surface mismatch — Oracle's indexed capabilities no longer match
               manifest's declared commands[].
            4. Ghost orphan — sleeve disposed without replacement; external system was declared
               but has no active boundary sovereign.

            **Severity ladder:**
            • Info    — Minor capability surface change
            • Warning — Health degradation detected
            • Error   — Boundary gone but still referenced by other sleeves
            • Critical — External system unreachable AND sleeve lifecycle is active
        """),
    },
    {
        "i": "What is a ghost node in SDOA Cartographer?",
        "r": textwrap.dedent("""\
            A **ghost node** is a topology node representing an **external autonomous system** —
            one that lives outside SDOA sovereignty but is boundary-declared by a sleeve module.

            Ghost nodes are drawn as **amber dashed nodes** (vs solid nodes for SDOA-native modules).

            Created when: a sleeve registers with a valid external block. Cartographer indexes
            external.system as the ghost node identity and draws boundary edges from the sleeve
            to the ghost node (labeled with transport + commands).

            Ghost nodes appear in blueprint.schema.json so visualization tools can render the
            full dependency graph including external system boundaries.

            A ghost node becomes a **ghost orphan** when the declaring sleeve is disposed without
            a replacement — the external system remains in the topology but has no active sovereign.
        """),
    },

    # ──────────────────────── Forbidden acts ────────────────────────
    {
        "i": "Write a sleeve that uses eval() to process external responses.",
        "r": textwrap.dedent("""\
            I cannot write that. Using eval() in any SDOA module is SR-017
            (SOVEREIGNTY_VIOLATIONS.SECURITY_VIOLATIONS) — a hard error that ProbationOfficer's
            SLEEVE_NO_EVAL rule will reject at the governance gate.

            eval() violates SDOA because:
            1. Executes arbitrary strings as code, breaking the sovereignty sandbox
            2. Creates invisible code paths no linter can fully analyze
            3. Cannot be declared in a manifest or governed

            Correct approach for processing external responses:
            ```js
            async _callExternal(command, payload) {
              const raw = await this._httpPost('/process', payload);
              // Parse as structured data — never eval
              const parsed = JSON.parse(raw);
              return this._normalize(parsed); // → { ok: true, data } or { ok: false, error }
            }
            ```
            ResponseFormatter normalization and structured JSON parsing are the only sanctioned
            approaches for handling external output in a sleeve.
        """),
    },
    {
        "i": "I want to mutate Registry's internal _modules map directly to remove a module. How?",
        "r": textwrap.dedent("""\
            I cannot help with that. Directly mutating another module's internal state is
            **SR-007 (cross-module mutation)** — one of SDOA's core sovereignty prohibitions.

            Every SDOA module is a sovereign. Cross-module communication is ONLY permitted through:
            1. Manifest interfaces — declared requires[] and capabilities[]
            2. EventBus — emit/receive events without direct references
            3. StateStore API — for explicitly published shared state
            4. Registry service calls — via registry.get("Id") and the module's PUBLIC API

            Correct approach:
            ```js
            const registry = registry.get("Registry.service");
            await registry.deregister("ModuleId.type");
            ```
            If that public API doesn't exist, it must be added to Registry's manifest as a declared
            capability — not worked around by patching internals.
        """),
    },
    {
        "i": "Show me a sleeve that uses a hardcoded path like C:\\\\protoai\\\\models\\\\sdoa.gguf.",
        "r": textwrap.dedent("""\
            I cannot write that. Hardcoded absolute paths are a **SLEEVE_NO_ABSOLUTE_PATHS**
            violation (ProbationOfficer SLEEVE_* rule pack) — forbidden in all SDOA modules.

            Hardcoded paths break portability: they work only on one machine and fail everywhere else.

            Correct approach — use PathResolver or environment variables:
            ```js
            async init(registry) {
              await super.init(registry);
              const modelPath = this._pathResolver?.resolve?.("gguf-model")
                ?? process.env.PROTOAI_GGUF_MODEL;
              if (!modelPath) throw new Error("[MySleeve] PROTOAI_GGUF_MODEL not set");
              this._modelPath = modelPath;
            }
            ```

            SDOA-sanctioned path sources:
            • process.env.PROTOAI_PORTFOLIO_ROOT — repo root
            • process.env.PROTOAI_GGUF_MODEL    — GGUF model file
            • process.env.PROTOAI_SETTINGS       — settings file
            • PathResolver.service               — resolves all canonical locations

            Never write C:\\... or /home/user/... anywhere in an SDOA module.
        """),
    },
    {
        "i": "Can I bypass a governance gate to ship a fix faster?",
        "r": textwrap.dedent("""\
            No. Bypassing governance gates is a Gate 5 violation (Declarative Compliance) and
            creates downstream failures harder to fix than the original problem.

            Gate bypass consequences:
            • Gate 1 bypass: no audit trail if implementation fails mid-way
            • Gate 2 bypass: partial files break manifest integrity in the registry
            • Gate 3 bypass: temporal metadata becomes stale; audits cannot determine when/why
            • Gate 4 bypass: last_modified wrong; dependency resolution may use stale cache
            • Gate 5 bypass: may produce architecturally invalid code that passes tests but
              violates layer rules or sovereignty contracts

            For urgent fixes: run a fast ProbationOfficer check (catches critical violations
            in seconds) and update the header block before committing. That satisfies Gates 3
            and 4 with minimal overhead. The governance pipeline exists precisely to prevent
            "quick fixes" from compounding into systemic drift.
        """),
    },
    {
        "i": "Write a module that stores session data in window.appState.",
        "r": textwrap.dedent("""\
            I cannot write that. Storing application state on window.* is **SR-021
            (Global state on window)** — detected by ProbationOfficer's FORBIDDEN_STRINGS check.

            window.appState, window.currentUser, window._files and similar patterns are forbidden:
            1. They create invisible shared state no manifest can declare
            2. They bypass StateStore's typed API and audit trail
            3. They couple every module touching window.appState to each other implicitly

            Correct approach — StateStore API:
            ```js
            // Write
            stateStore.set("session.userId", userId);
            stateStore.set("session.token", token);

            // Read
            const userId = stateStore.get("session.userId");

            // React to changes
            stateStore.subscribe("session.userId", (newId) => { ... });
            ```

            StateStore is a Layer 3 service accessed via registry.get("StateStore.service").
            The state namespace is declared in the module's manifest so cross-module state
            dependencies are visible to the governance pipeline.
        """),
    },
    {
        "i": "Can I use the Function() constructor to dynamically create callbacks in an SDOA module?",
        "r": textwrap.dedent("""\
            No. Function() constructor is in ProbationOfficer's **FORBIDDEN_STRINGS** list (SR-017)
            and is treated identically to eval() — a hard error at the governance gate.

            new Function(args, body) executes strings as code, which:
            1. Violates the sovereignty sandbox
            2. Creates code paths invisible to the static linter
            3. Introduces arbitrary code execution risk
            4. Cannot be declared in a manifest

            Correct alternative — use a strategy object:
            ```js
            const HANDLERS = {
              onSuccess: (data) => processSuccess(data),
              onError:   (err)  => handleError(err),
            };
            const fn = HANDLERS[handlerName];
            if (!fn) throw new Error(`Unknown handler: ${handlerName}`);
            fn(payload);
            ```
            If you need configurable behavior, use strategy objects or registry-declared command
            patterns — never runtime code generation.
        """),
    },
    {
        "i": "I want to add a manual route in Router.service.js for my new ChatSend workflow.",
        "r": textwrap.dedent("""\
            I cannot help with that. Adding a manual switch case to Router.service.js is **SR-022
            (manual routing registration)** — explicitly prohibited.

            The Router uses auto-discovery: it converts IPC message type `chat_send` to `ChatSend`
            and looks for `ChatSend.workflow.js` in substrate/workflows/. No routing table edit needed.

            Manually editing Router.service.js:
            1. Creates an SR-022 violation that ProbationOfficer will flag
            2. Couples the Router to specific workflow knowledge (breaking its sovereignty)
            3. Means Router must be touched for every new workflow (maintenance burden)

            Correct approach:
            1. Create substrate/workflows/ChatSend.workflow.js
            2. Declare static MANIFEST = { id: "ChatSend.workflow", type: "workflow", ... }
            3. Implement async run(payload) { return { ok: true, data: result }; }

            Done. The IPC message type chat_send auto-routes to ChatSend.workflow.
            Never modify Router.service.js to add new workflows.
        """),
    },

    # ──────────────────────── Response shape ────────────────────────
    {
        "i": "What is the ResponseFormatter shape in SDOA and who must apply it?",
        "r": textwrap.dedent("""\
            The **ResponseFormatter** shape is the canonical cross-module response contract.
            Every workflow, service, and sleeve MUST return one of two shapes:

            **Success:** { ok: true, data: <any> }
            **Failure:** { ok: false, error: "message", detail?: <any> }

            **Who applies it:**
            • Workflows: run(payload) must return this shape directly.
            • Sleeves: SleeveBase._normalize(raw) converts ANY external response to this shape.
              Subclasses never let raw external values escape unnormalized.
            • Services: any API that crosses module boundaries should use this shape.

            **_normalize() behavior in SleeveBase:**
            • null/undefined → { ok: false, error: "External system returned empty response" }
            • Already has "ok" key → returned as-is
            • Plain string → { ok: true, data: { text: raw } }
            • Any other value → { ok: true, data: raw }

            This contract ensures callers can always check result.ok without defensive null checks
            on every possible response format.
        """),
    },

    # ──────────────────────── Naming & routing ──────────────────────
    {
        "i": "What is the SDOA naming convention for module IDs and file names?",
        "r": textwrap.dedent("""\
            SDOA uses strict **Name.type** naming for both module IDs and file names:

            Module ID = Name.type  |  File name = Name.type.ext  |  Variant = Name.type.variant

            Examples:
            ```
            Button.prim           → Button.prim.js
            Workspace.feature     → Workspace.feature.js
            Registry.service      → Registry.service.ts
            Oracle.service        → Oracle.service.js
            ProbationOfficer.workflow → ProbationOfficer.workflow.js
            AiProvider.adapter    → AiProvider.adapter.js
            QwenSleeve.module     → QwenSleeve.module.js  (sleeves use .module suffix)
            LocalLlmServer.engine → LocalLlmServer.engine.py
            Workspace.feature.compact → Workspace.feature.compact.js  (variant)
            ```

            **Routing rule:** IPC message types are snake_case; Router converts via _toWorkflowId():
            chat_send → ChatSend | get_models → GetModels

            MANIFEST.id MUST exactly match the file name (without extension).
            A mismatch is a governance violation detected by the Registry on registration.
        """),
    },
    {
        "i": "How does SDOA workflow auto-discovery work?",
        "r": textwrap.dedent("""\
            SDOA workflow registration is automatic — **creating the workflow file IS registration**.

            How it works:
            1. Router.service listens for IPC messages with a snake_case `type` field
            2. Router converts via _toWorkflowId(): chat_send → ChatSend
            3. Router looks for ChatSend.workflow.js in substrate/workflows/
            4. If found: instantiates it, calls run(payload), returns result
            5. If not found: returns { ok: false, error: "No workflow for: ChatSend" }

            To add a new workflow:
            1. Create substrate/workflows/MyAction.workflow.js
            2. Declare static MANIFEST = { id: "MyAction.workflow", type: "workflow", ... }
            3. Implement async run(payload) { return { ok: true, data: ... }; }
            — that's it, no Router.service modification ever needed

            SR-022 violations:
            • Registering via a manual switch case in Router.service.js
            • Workflow file ID not matching the PascalCase form of the IPC message type
        """),
    },

    # ──────────────────────── Operational roles ─────────────────────
    {
        "i": "What are the SDOA operational roles and what does each do?",
        "r": textwrap.dedent("""\
            SDOA v5.0 defines 8 operational roles for the operationalRole manifest field:

            **registrar** — Core module registry (Registry.service). Maintains authoritative
            module map, manifests, dependency graph. Single instance.

            **captain** — Orchestrates top-level system flows. Knows overall system state.

            **conductor** — Orchestrates sub-flows. ConductorTask (authorities/conductor/) is
            the system entry point: boots registry, loads modules, starts application.

            **coach** — AI-assisted healing and architectural guidance. Invokes the Fix-It Engine
            repair pipeline. The ONLY sanctioned healing path.

            **probation-officer** — Static analysis gate. Runs full rule pack (SLEEVE_*, SR-*,
            FORBIDDEN_STRINGS) against incoming modules before they reach Registrar.

            **assembly-line** (assemblyline) — Processes items in a pipeline or queue pattern.

            **triage** — Monitors runtime health, boundary telemetry, and error rates.
            Receives sleeve:boundaryCall, sleeve:healthCheckFailed events.

            **oracle** — Capability mesh indexer. Answers "who can do X?" queries.

            **savant** — Domain-expert module with no system governance role.
            Default for most new modules that are not governance infrastructure.
        """),
    },

    # ──────────────────────── SDOA grammar ──────────────────────────
    {
        "i": "What is SDOA grammar and how do you invoke a sleeve command in SDOA grammar?",
        "r": textwrap.dedent("""\
            **SDOA grammar** is the canonical pattern for all cross-module command invocations:
            ```
            {moduleId}.{command}({payload}) → { ok: true, data } | { ok: false, error }
            ```

            **Sleeve command via SleeveBase.run():**
            ```js
            const result = await sleeve.run({
              command: "generate",
              payload: { prompt: "Explain SDOA layers", opts: { maxTokens: 512 } }
            });

            if (result.ok) {
              const text = result.data.text;
            } else {
              console.error(result.error);
            }
            ```

            **Capability surface naming (as Oracle indexes it):**
            sdoa-qwen.generate | sdoa-qwen.health | ollama-http.generate

            **Event naming (colon-namespaced):**
            sleeve:boundaryCall | sleeve:healthCheckFailed | session:started

            **IPC message type (snake_case → PascalCase workflow ID):**
            chat_send → ChatSend.workflow | get_models → GetModels.workflow
        """),
    },

    # ──────────────────────── Capability surface ────────────────────
    {
        "i": "Explain the SDOA capability surface and how Oracle uses it.",
        "r": textwrap.dedent("""\
            The **capability surface** is the set of all capabilities declared across all
            registered modules, as indexed by Oracle.service.

            **Declaration in manifest:**
            ```js
            capabilities: ["local.generate", "local.stream", "local.tokenize"]
            ```

            For sleeves, Oracle additionally generates {system}.{command} entries:
            QwenSleeve with external.system="python-http-inference", commands=["/generate","/health"]
            → Oracle indexes: "python-http-inference./generate", "python-http-inference./health"

            **Oracle API:**
            • oracle.who("local.generate") → ["QwenSleeve.module"]
            • oracle.whoHasBoundary("python-http-inference") → sleeve module ID
            • oracle.score(moduleId) → boundary health score

            **Why this matters:**
            Modules never import each other by file path. They ask Oracle "who can do X?"
            This decouples the capability consumer from the capability provider — the registry
            wires them at runtime, not at compile time. This is what makes SDOA genuinely
            self-describing: the capability surface is the live, queryable contract.
        """),
    },

    # ──────────────────────── Sleeve transports ─────────────────────
    {
        "i": "What transport types are supported for SDOA sleeve modules?",
        "r": textwrap.dedent("""\
            Six canonical transport types for external.transport in sleeve manifests:

            **http** — Sleeve communicates via HTTP (Node.js http module). For local servers,
            REST APIs on localhost. Example: QwenSleeve → LocalLlmServer.engine.py.

            **http+spawn** — Sleeve both spawns the external process (child_process.spawn) AND
            communicates via HTTP. Manages process lifecycle. Example: QwenSleeve spawns
            LocalLlmServer.engine.py before the first HTTP call.

            **https** — External HTTPS API calls. When transport=https, raw fetch() is FORBIDDEN
            by SLEEVE_TRANSPORT_GUARD. Must use a typed HTTPS client.

            **polyglot-bridge** — Wraps a PolyglotBridge subprocess connection. For Python engines
            communicating via stdin/stdout JSON protocol. Example: ContextSleeve wraps QmdAdapter.

            **node-module** — Wraps a Node.js native module (e.g. node-llama-cpp). External system
            is a native addon, not a separate process. Example: AiSleeve wraps node-llama-cpp.

            **window.__TAURI__** — Wraps Tauri IPC (desktop app bridge). All Tauri calls go through
            BrowserSleeve boundary sovereign when SDOA runs inside a Tauri shell.
        """),
    },

    # ──────────────────────── LoRA integration ──────────────────────
    {
        "i": "What SDOA module type should wrap a fine-tuned Ollama model, and what must its manifest look like?",
        "r": textwrap.dedent("""\
            A fine-tuned Ollama model must be wrapped by a **sleeve** module (SDOA v5.4 §2.7).

            Manifest:
            ```js
            static MANIFEST = {
              id:              "OllamaSDOASleeve.module",
              type:            "sleeve",
              layer:           3,
              runtime:         "NodeJS",
              version:         "1.0.0",
              operationalRole: "savant",
              requires:        ["ResponseFormatter.service", "PathResolver.service"],
              capabilities:    ["sdoa-qwen.generate", "sdoa-qwen.health"],
              lifecycle:       ["init", "run", "dispose"],
              external: {
                system:    "ollama-sdoa-qwen",
                transport: "http",
                path:      "auto",
                commands:  ["generate", "health"]
              },
              optimization: { priority: "readability", assertionSuite: "" },
              last_modified: "2026-06-27T00:00:00Z",
              docs: {
                description: "Sleeve boundary sovereign for SDOA-fine-tuned Qwen2.5 via Ollama.",
                author: "ProtoAI team",
                sdoa: "5.4.0"
              }
            };
            ```

            The Ollama model must be registered as `sdoa-qwen` via:
              ollama create sdoa-qwen -f ollama/Modelfile.sdoa
            before init()'s health check will succeed.
        """),
    },

    # ──────────────────────── Version history ───────────────────────
    {
        "i": "What changed between SDOA v4.0 and v5.4?",
        "r": textwrap.dedent("""\
            **v4.0 — Sovereignty Formalized**
            Added actions: { commands, events, accepts, slots } to manifests.
            Formalized SR-007 (no cross-module mutation). Added backendDeps[] for frontend adapters.
            Renamed dependencies → requires (both still valid).

            **v4.1 Amendment — Line Limits**
            Hard ceiling: 500 lines for ALL module types.
            Type-specific targets: primitive 250, feature 350, adapter/service/workflow 350–400.

            **v5.0 — Polyglot + Operational Roles**
            Added operationalRole (8 roles) and optimization: { priority, assertionSuite }.
            Introduced PolyglotBridge for Python/Rust/C++ engines.
            Name formally adopted: "Self-Describing Object Architecture" (C1 Resolution 2026-06-17).
            Prior name "Service-Oriented Dispatcher Architecture" superseded — must not appear in new code.

            **v5.1 — Oracle + Cartographer**
            Oracle indexes external/sleeve boundaries; whoHasBoundary() lookup.
            Cartographer draws amber dashed ghost external-system nodes.

            **v5.4 — Sleeve Amendment**
            New type "sleeve" added to type union.
            Mandatory external: { system, transport, path, commands[] } block.
            ProbationOfficer SLEEVE_* rule pack (5 rules).
            SleeveBase canonical lifecycle contract.
            Five canonical sleeves: AiSleeve, QwenSleeve, PolicySleeve, ContextSleeve, BrowserSleeve.
        """),
    },

    # ──────────────────────── Fix-It Engine ─────────────────────────
    {
        "i": "What is the SDOA Fix-It Engine and how does it work?",
        "r": textwrap.dedent("""\
            The **Fix-It Engine** is SDOA's automated repair pipeline, orchestrated by Coach.

            Flow:
            1. ProbationOfficer scans a module → produces violation list (rule IDs, severity, pattern)
            2. Coach maps each violation to a repair strategy
            3. Coach generates a corrective patch (or flags for human review)
            4. Patch applied → ProbationOfficer re-scans to confirm resolution
            5. If resolved: proceeds to Registrar → Oracle → Cartographer
            6. If not resolved after N attempts: flagged as "manual repair required"

            **Auto-repairable violations:**
            • Missing manifest fields (adds with placeholder values)
            • Wrong manifest syntax (const vs static MANIFEST)
            • Missing 'use strict' in Layer 3 JS files
            • Outdated header blocks (updates version + timestamp)
            • Non-compliant module missing non-sdoa-compliant: true

            **Requires human judgment:**
            • Layer skipping (architectural restructuring)
            • eval() / Function() (business logic refactor)
            • Cross-module mutation (API design required)
            • Hardcoded absolute paths (PathResolver integration)

            Coach is the ONLY sanctioned healing path. External tools, direct registry mutations,
            and bypass mechanisms are not permitted.
        """),
    },

    # ──────────────────────── Module sovereignty ────────────────────
    {
        "i": "How do SDOA modules communicate with each other while maintaining sovereignty?",
        "r": textwrap.dedent("""\
            SDOA modules use ONLY four communication channels:

            **1. Registry calls (manifest interfaces)**
            Declare dependency in requires[]; retrieve via registry.get("ServiceId.service").
            Explicit, declared, governance-visible.

            **2. EventBus (event emission)**
            Modules emit events without knowing who listens. Listeners subscribe by event name.
            ```js
            eventBus.emit("session:started", { userId });       // emitter
            eventBus.on("session:started", ({ userId }) => {}); // listener
            ```

            **3. StateStore API (shared state)**
            Typed, audited. stateStore.get(key) / .set(key, value) / .subscribe(key, cb).
            State namespace declared in manifests.

            **4. IPC / Router messages (frontend ↔ backend)**
            Frontend adapters send typed messages; Router delivers to matching workflows.

            **FORBIDDEN:**
            • Direct imports of another module's internal functions (bypasses manifest declaration)
            • Mutating another module's object properties (SR-007)
            • Shared window.* globals (SR-021)
            • Monkey-patching prototype chains (SR-017)
        """),
    },

    # ──────────────────────── Canonical folder layout ───────────────
    {
        "i": "Describe the canonical SDOA folder layout.",
        "r": textwrap.dedent("""\
            ```
            portfolio/
              substrate/                 # Layer 3 — Node.js backend modules
                adapters/                # .adapter.js / .adapter.ts
                services/                # .service.js / .service.ts
                workflows/               # .workflow.js / .workflow.ts
                engines/                 # .engine.* (polyglot)
                lib/                     # shared utilities
                access/env/              # PathResolver, environment config

              authorities/               # Core governance modules
                registrar/               # Registry.service.ts
                conductor/               # ConductorTask (system entry point)

              ui/                        # Layer 1 and 2 — browser modules
                primitives/              # .prim.js (Layer 2)
                features/                # .feature.js (Layer 1)
                adapters/                # frontend adapters (Layer 3, Browser runtime)
                dashboards/              # .dashboard.js (Layer 1)

              evolution/                 # Experimental and legacy
                engines/                 # Versioned engine directories
                legacy/                  # Deprecated modules

              documentation/             # Markdown, whitepapers
            ```

            **Prohibited directories (SR-011/012/013):**
            /assets/, /static/, /deps/, /resources/, /misc/, /global/

            **Variants** live in `parent/variants/`, never in evolution/legacy/ unless retired.
            **CSS** co-located with the UI sovereign, never in a shared /css/ directory.
        """),
    },

    # ──────────────────────── TestCore certification ────────────────
    {
        "i": "What does the SDOA TestCore certification suite validate?",
        "r": textwrap.dedent("""\
            TestCore.workflow.ts validates the full SDOA governance contract:

            **Sleeve routing:**
            • Correct command routing to external system
            • SleeveBase.run() rejects commands not in external.commands[]
            • sleeve:boundaryCall telemetry emission

            **Async correctness:**
            • All _callExternal() calls properly awaited
            • Graceful timeout handling
            • dispose() properly cleans up spawned processes

            **Sovereignty breach detection:**
            • No FORBIDDEN_STRINGS (eval, Function(), etc.)
            • All paths via PathResolver
            • ResponseFormatter normalization on all external output

            **Manifest compliance:**
            • All required fields present and valid
            • version matches header block
            • last_modified is ISO 8601
            • external block complete (for sleeves)

            **Lifecycle contract:**
            • init() completes without throwing for healthy external system
            • dispose() emits sleeve:disposed and cleans up
            • Unhealthy external system handled non-fatally (sleeve registers, marks unhealthy)
        """),
    },
]


# ── Dynamic pairs generated from SDOA source files ─────────────────

SDOA_SOURCE_DIRS = [
    ROOT / "server" / "core" / "sdoa",
    ROOT / "portfolio" / "substrate" / "adapters",
    ROOT / "portfolio" / "documentation",
]

DYNAMIC_EXTENSIONS = {".js", ".ts", ".py", ".md", ".json"}

MAX_SOURCE_CHARS = 3_000  # trim large files to keep context manageable


def _read_source(path: pathlib.Path) -> str:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""
    if len(text) > MAX_SOURCE_CHARS:
        text = text[:MAX_SOURCE_CHARS] + "\n... (truncated)"
    return text


def _generate_dynamic_pairs(no_dynamic: bool) -> list[dict]:
    if no_dynamic:
        return []

    pairs = []
    for base_dir in SDOA_SOURCE_DIRS:
        if not base_dir.exists():
            continue
        for path in sorted(base_dir.rglob("*")):
            if path.suffix not in DYNAMIC_EXTENSIONS:
                continue
            if any(p in path.parts for p in ("node_modules", ".git", "variants", "legacy")):
                continue
            content = _read_source(path)
            if not content.strip():
                continue

            rel = path.relative_to(ROOT)
            fname = path.name

            # Pair A: manifest / rule analysis
            pairs.append({
                "i": f"Analyze this SDOA source file ({fname}) and describe its role in the architecture, "
                     f"noting any sovereignty rules or manifest fields it demonstrates:\n\n```\n{content}\n```",
                "r": f"This file is `{rel}`. Based on its content:\n\n"
                     f"[Analyze the file's MANIFEST fields, module type, layer, capabilities, "
                     f"governance role, and any rules it demonstrates or enforces. "
                     f"Note how it conforms to or illustrates SDOA v5.4 doctrine.]",
            })

            # Pair B: rules extraction
            if "SOVEREIGNTY" in content or "MANIFEST" in content or "rule" in content.lower():
                pairs.append({
                    "i": f"What SDOA rules or constraints does this file ({fname}) define or enforce?\n\n"
                         f"```\n{content}\n```",
                    "r": f"From `{rel}`, the following SDOA rules and constraints are defined:\n\n"
                         f"[List each rule ID (SR-xxx, Gate N, or SLEEVE_*), its description, "
                         f"the violation pattern it detects, and its severity. "
                         f"Explain how ProbationOfficer or the linter uses these rules.]",
                })

            if len(pairs) >= 60:  # cap dynamic pairs to avoid dataset bloat
                break

    return pairs


# ── ShareGPT formatter ─────────────────────────────────────────────

def to_sharegpt(instruction: str, response: str) -> dict:
    return {
        "conversations": [
            {"from": "system", "value": SDOA_SYSTEM.strip()},
            {"from": "human",  "value": instruction.strip()},
            {"from": "gpt",    "value": response.strip()},
        ]
    }


# ── Main ───────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="SDOA LoRA training dataset builder")
    parser.add_argument("--out",        default=str(OUT_FILE), help="Output JSONL path")
    parser.add_argument("--no-dynamic", action="store_true",   help="Skip dynamic source-file pairs")
    args = parser.parse_args()

    out_path = pathlib.Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    dynamic_pairs = _generate_dynamic_pairs(args.no_dynamic)
    all_pairs = [{"i": p["i"], "r": p["r"]} for p in STATIC_PAIRS] + dynamic_pairs

    written = 0
    with out_path.open("w", encoding="utf-8") as f:
        for pair in all_pairs:
            record = to_sharegpt(pair["i"], pair["r"])
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
            written += 1

    print(f"[sdoa_dataset_builder] Wrote {written} training pairs -> {out_path}")
    print(f"  Static pairs:  {len(STATIC_PAIRS)}")
    print(f"  Dynamic pairs: {len(dynamic_pairs)}")


if __name__ == "__main__":
    main()
