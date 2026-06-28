# SDOA Portfolio — v5.4

**Self-Describing Object Architecture** | Edition 5.4 — Sovereign Integration & Sleeve Amendment

---

## What is SDOA?

Every module in this portfolio is **self-describing**: it carries a static `MANIFEST` block that declares its identity, layer classification, runtime, capabilities, dependencies, events, and governance metadata. No hidden wiring. No implicit coupling. No ambient globals.

The runtime reads manifests at startup to build the registry, validate the dependency graph, and route capability requests — without any hand-written switch statements or hardcoded module lists.

---

## v5.4 — Sleeve Module Class

Edition 5.4 ratifies the **Sleeve Module Class** (`*.sleeve.js`): the only module class permitted to bridge internal SDOA state to external systems (CLIs, HTTP APIs, local daemons, IPC channels). The five canonical sleeve sovereigns pre-date the naming convention and retain their original `.module.*` filenames (grandfathered); all new sleeves from v5.4 forward use the `.sleeve.js` / `.sleeve.ts` suffix.

### Rules

| Rule | Sleeve Constraint |
|------|------------------|
| Mutation | Never write to peer module source files |
| Eval | No `eval()` or `Function()` constructors |
| Paths | No hardcoded absolute paths — use PathResolver |
| Transport | Only the declared `external.transport` may be used |
| Output | All results must pass through ResponseFormatter |
| Size | 500-line ceiling |

### Manifest external block

```js
static MANIFEST = {
  id:      "MyThing.sleeve",
  type:    "sleeve",          // ← sleeve classification
  layer:   3,
  runtime: "NodeJS",
  version: "1.0.0",
  operationalRole: "savant",
  requires: ["ResponseFormatter.service", "PathResolver.service"],

  external: {
    system:    "my-external-system",   // canonical system name
    transport: "https",                // cli | https | node-module | http+spawn | polyglot-bridge | window.__TAURI__
    path:      "auto",                 // resolved at runtime via PathResolver
    commands:  ["complete", "stream"]  // allowed command surface
  },

  actions: { commands: { ... }, events: { ... }, accepts: {}, slots: {} },
  docs: { description: "...", author: "...", sdoa: "5.4" }
};
```

### Canonical sleeve sovereigns

| Module | Wraps | Transport |
|--------|-------|-----------|
| `AiSleeve.module.ts` | node-llama-cpp GGUF inference | node-module |
| `QwenSleeve.module.js` | LocalLlmServer.engine.py | http+spawn |
| `PolicySleeve.module.js` | LLM provider APIs | https |
| `ContextSleeve.module.py` | QmdAdapter (NodeJS) | polyglot-bridge |
| `BrowserSleeve.module.js` | Tauri IPC | window.__TAURI__ |

---

## Boundary Topology

```
┌─────────────────── SDOA Sovereign Layer ────────────────────┐
│  Registry ── Oracle ── ProbationOfficer ── Cartographer     │
│      │           │                                          │
│  AiSleeve  QwenSleeve  PolicySleeve  ContextSleeve  BrowserSleeve │
└────⟁──────────⟁──────────⟁──────────────⟁──────────────⟁──────────┘
     │           │           │              │             │
⬚ node-llama ⬚ http+   ⬚ HTTPS APIs  ⬚ QmdAdapter  ⬚ Tauri IPC
   (ghost)    spawn(ghost)  (ghost)        (ghost)       (ghost)
```

`⟁` = sleeve boundary node   `⬚` = external ghost node (amber, dashed)

---

## Governance Gates (§4)

```
Synthesized ──► ProbationOfficer (SLEEVE_* rules)
                     │
                     ▼
              Registrar (external block validation)
                     │
                     ▼
              Oracle (capability mesh indexing)
                     │
                     ▼
              Triage (circuit-breaker monitoring)
```

The healing path is exclusively: **AiSleeve → heal:patch-request → Coach → ProbationOfficer → Registrar**. No module may write to a peer's source file directly.

---

## Module Taxonomy

| Layer | Type | Examples |
|-------|------|---------|
| 1 | feature | Dashboard, Projects, Chat |
| 2 | primitive | Button, Modal, Input |
| 3 | service | Registry, Oracle, Logger |
| 3 | workflow | Coach, ProbationOfficer, Triage, Cartographer, Scaffold, InnovationDetector |
| 3 | engine | LlmPolicyEngine, LocalLlmServer, ContextEngine |
| 3 | adapter | AiProvider, LlmConnector |
| 3 | repository | Memory.repository |
| 3 | **sleeve** | AiSleeve, QwenSleeve, PolicySleeve, ContextSleeve, BrowserSleeve |

---

## Directory Structure

```
portfolio/
├── README.md                    ← this file
├── blueprint.schema.json        ← canonical module registry + ghost nodes
├── sdoa-vnext.lock.json         ← system lock (v5.4 ratified)
├── authorities/
│   └── registrar/               ← Registry.service.ts (core registrar)
├── substrate/
│   ├── adapters/                ← AiProvider, AiSleeve, QwenSleeve, BrowserSleeve
│   ├── bridges/                 ← PolicySleeve, LlmBridge (legacy)
│   ├── engines/                 ← LlmPolicyEngine, LocalLlmServer, ContextSleeve
│   ├── services/                ← Oracle, Middleware, ResponseFormatter, PathResolver
│   └── workflows/               ← Coach, ProbationOfficer, Triage, Scaffold,
│                                    Cartographer, InnovationDetector, TestCore
└── documentation/
    ├── Compendium/              ← Books I–IV (canonical architecture reference)
    ├── Whitepaper/              ← Executive + Technical v5.4 editions
    ├── Manifest-Spec/           ← machine-readable manifest field specification
    ├── Diagrams/                ← boundary topology + architecture map
    ├── Release-Notes/           ← per-version release notes
    ├── Freeze/                  ← SHA-256 checksum + Freeze Certificate
    └── Archive/                 ← superseded editions (v4.x, v5.0)
```

---

## Quick Reference

```bash
# Scaffold a new sleeve module
sdoa new sleeve --id MyApi.sleeve --system "my-api" --transport https

# Run the full governance gate
node -e "require('./substrate/workflows/ProbationOfficer.workflow.js').run({ source })"

# Query capability surface
node -e "require('./substrate/services/Oracle.service.js').whoHasBoundary({ system: 'tauri-ipc' })"
```

---

*SDOA v5.4 — Sovereign Integration & Sleeve Amendment. Canonical ledger: `portfolio/sdoa-vnext.lock.json`.*
