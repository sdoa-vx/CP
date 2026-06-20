# SDOA Canonical Rulebook

**Self-Describing Object Architecture — v5.0**
Synthesized from 53 source files in `C:\SDOAvX` as of 2026-06-17.

---

## What This Is

This directory is the canonical SDOA rulebook. It contains extracted rules, constraints, schemas, registries, and verbatim exemplars from the SDOA v5.0 system. All `.js` rule files are pure CommonJS data modules — they contain no implementation logic, only structured rule objects for tooling, validators, code generators, and documentation systems to consume.

The `index.js` barrel re-exports every named export from every subdirectory.

---

## Directory Structure

```
sdoa/
  index.js                     Root barrel export (all rule modules)
  README.md                    This file

  manifests/
    manifest.schema.json       JSON Schema (draft-07) for SDOA manifests
    manifest.rules.js          REQUIRED_FIELDS, V1_2_MANDATORY_FIELDS, VALIDATION_LOGIC
    manifest.example.json      Annotated example manifest

  sovereignty/
    boundaries.js              SOVEREIGNTY_BOUNDARIES zones, PROHIBITED_DIRECTORIES
    rules.js                   25 sovereignty rules (SR-001 – SR-025)
    violations.js              SOVEREIGNTY_VIOLATIONS by category

  constraints/
    naming.js                  MODULE_ID format, TYPE_SUFFIXES, WORKFLOW_ROUTING_NAMES
    placement.js               TOP_LEVEL_DIRECTORIES, FILE_TYPE_RULES, CANONICAL_PATHS
    layer.js                   LAYER_RULES (L1/L2/L3), LAYER_DETECTION, LAYER_TRAFFIC matrix
    lifecycle.js               FRONTEND_LIFECYCLE, BACKEND_LIFECYCLE, MODULE_STATES
    line-limits.js             LINTER_LIMITS_V4, AMENDMENT_V4_1, EFFECTIVE_LIMITS
    json.js                    JSON_CATEGORY_RULES, CATEGORIES, PROHIBITED_LOCATIONS

  resolver/
    identity.js                MODULE_IDENTITY_RULES, VALIDATION_PIPELINE, SEMVER_COMPARISON
    routing.js                 ROUTING_RULES, AUTO_DISCOVERY, MESSAGE_TYPE_CONVERSION
    dependencies.js            DEPENDENCY_RESOLUTION_RULES, INIT_ORDER_RESOLUTION
    inheritance.js             MANIFEST_INHERITANCE_RULES (no inheritance in SDOA)

  registry/
    primitives.js              19 canonical UI primitives with full metadata
    workflows.js               Known workflows with IPC types and commands
    schemas.js                 SCHEMA_REGISTRY, SDOA_MANIFEST_INTERFACE, RESPONSE_FORMATTER
    engines.js                 ENGINE_REGISTRY, OPERATIONAL_ROLES (8 roles)
    module-types.js            12 MODULE_TYPE_DEFINITIONS (primitive through validator)

  version/
    sdoa.version.js            SDOA_VERSION, VERSION_HISTORY, COMPATIBILITY_MATRIX
    changelog.md               Human-readable changelog v1.0 → v5.0

  exemplars/
    README.md                  Index of all exemplar files
    base.ts                    SdoaModule base class and subclass hierarchy
    eventbus.ts                Universal EventBus
    registry.ts                Registry + SdoaManifest TypeScript interface
    response.ts                ResponseFormatter
    polyglot.ts                PolyglotBridge (Python subprocess)
    linter.ts                  SDOA compliance linter (lintContent / lintFile)
    conductor.index.ts         System entry point (ConductorTask)
    Comparators.service.ts     Type-specific comparators
    Logger.service.ts          Test logger with progress tracking
    Evaluator.service.ts       AlgoSim expression evaluator
    PersistentMemory.service.ts  LLM context memory loader
    AiBroker.adapter.ts        AI self-healing broker
    LlmConnector.adapter.ts    HTTPS + SSE connector (Anthropic / OpenAI / OpenRouter)
    TokenBudget.adapter.ts     Model context limits and trimToFit
    TestCore.workflow.ts       Single test runner with AI heal loop
    TestRunner.workflow.ts     Batch test runner with chapter demarcation
    SendMessage.workflow.ts    LLM chat orchestrator
```

---

## Key Architecture Facts

### SDOA Name
"Self-Describing Object Architecture" — adopted by C1 Resolution 2026-06-17. The prior name "Service-Oriented Dispatcher Architecture" is superseded and must not appear in new code.

### Three Layers
| Layer | Name | Responsibility |
|-------|------|----------------|
| L1 | Features | Composition. Assembles L2 primitives. No business logic. |
| L2 | Primitives | Reusable atomic UI components. No L1/L3 imports. |
| L3 | Adapters / Services / Workflows / Repositories | All backend and infrastructure logic. |

Layer-skipping is prohibited. L1 may not import L3 directly.

### Sovereignty
Every module is a sovereign. No module mutates another module's internals. Cross-module communication only through: manifest interfaces, EventBus, StateStore API, or registry service calls.

### Manifest
Every SDOA module must have a `static MANIFEST` (TypeScript) or `exports.MANIFEST` (JavaScript) object. Required fields: `id`, `type`, `version`, `runtime`, `layer`. v1.2 additionally requires: `capabilities`, `dependencies`, `docs`, `last_modified`. v5.0 adds: `operationalRole`, `optimization`.

### Routing
Router auto-discovery converts snake_case IPC message types to PascalCase workflow IDs. Creating the workflow file is the registration step. No explicit route tables.

### Line Limits (effective)
| Type | Target | Ceiling |
|------|--------|---------|
| Primitive | 250 | 500 |
| Feature | 350 | 500 |
| Adapter | 350 | 500 |
| Workflow | 400 | 500 |
| Repository | 400 | 500 |

### Response Shape
All workflows and services return `{ ok: true, data }` on success or `{ ok: false, error, detail }` on failure via `ResponseFormatter`.

### 19 Canonical UI Primitives
Button, Input, Toggle, Select, Panel, Modal, TabGroup, List, Tree, Form, Toast, Badge, Toolbar, EmptyState, ScrollMap, CodeEditor, ContextMenu, Spinner, Markdown.

---

## Usage

```js
const sdoa = require('./sdoa');

// Check a manifest
sdoa.MANIFEST_RULES.REQUIRED_FIELDS.forEach(f => {
  if (!manifest[f]) throw new Error(`Missing required field: ${f}`);
});

// Look up a primitive
const btn = sdoa.PRIMITIVE_REGISTRY.primitives.find(p => p.id === "Button.prim");

// Get line limits for a module type
const limits = sdoa.LINE_LIMIT_RULES.AMENDMENT_V4_1;
const ceiling = limits.HARD_CEILING; // 500
```

---

## Sources

All rules were extracted from 53 files in `C:\SDOAvX`:

- `SDOA-Whitepaper-Technical.txt` — architectural principles and sovereignty model
- `SDOA-Governance-Outline.txt` — governance, probation pipeline, operational roles
- `SDOA-Historical-Timeline.txt` — version history v1.0 – v5.0
- `_variances/SDOAvX/sdoa-core/src/` — linter, base, registry, eventbus, response, polyglot
- `authorities/conductor/index.ts` — system entry point
- `substrate/services/`, `substrate/adapters/`, `substrate/workflows/` — Layer 3 implementations
- `blueprint.schema.json` — canonical module dependency declarations
- `config.validator.json` — config schema
