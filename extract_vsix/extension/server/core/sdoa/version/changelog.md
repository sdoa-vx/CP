# SDOA Changelog

> Extracted from SDOA-Historical-Timeline.txt, SDOA-Whitepaper-Technical.txt Section 21,
> SDOA-Governance-Outline.txt Section 10, and linter/registry source files.
> Source of truth for the canonical SDOA specification history.

---

## v5.0 — June 2026

**Official name formalized. operationalRole and optimization fields added.**

- C1 Resolution 2026-06-17: Official name is **Self-Describing Object Architecture (SDOA)**. Prior informal name "Service-Oriented Dispatcher Architecture" is superseded.
- New manifest field: `operationalRole` (optional). Valid values: `registrar`, `captain`, `conductor`, `coach`, `probation-officer`, `assembly-line`, `triage`, `savant`.
- New manifest field: `optimization` (optional). Shape: `{ priority: "speed"|"safety"|"readability"|"memory-footprint", assertionSuite: string }`.
- Linter version header updated to `Version: 5.0.0`.
- Registry count: 147 modules.
- 19 canonical UI primitives standardized (Button, Input, Toggle, Select, Panel, Modal, TabGroup, List, Tree, Form, Toast, Badge, Toolbar, EmptyState, ScrollMap, CodeEditor, ContextMenu, Spinner, Markdown).
- Five Implementation Protocol Gates formally documented: Pending State (G1), Atomic File Delivery (G2), Temporal Metadata Headers (G3), Micro-Incrementation (G4), Declarative Compliance (G5).

---

## v4.1 Amendment — May/June 2026

**Line limit targets raised. File placement rules clarified.**

- Line limit targets raised per module type:
  - Primitive: 150 → 250 (hard ceiling: 500)
  - Feature: 200 → 350 (hard ceiling: 500)
  - Adapter: 200 → 350 (hard ceiling: 500)
  - Workflow: 200 → 400 (hard ceiling: 500)
  - Repository: 200 → 400 (hard ceiling: 500)
- Absolute hard ceiling: ~500 lines for all module types.
- CSS file placement rules clarified: CSS belongs to UI sovereign; primitive CSS co-located; global tokens in `ui/tokens.css` only.
- Binary file placement rules clarified: `.wasm`, `.bin` files live with the consuming engine.
- JSON file placement rules clarified: JSON lives with the sovereign that consumes it.
- Variant placement rules documented: variants live in `parent/variants/{descriptor}/` — never in `legacy/`, `experimental/`, or prohibited directories.

---

## v4.0 — May 2026

**Three-layer architecture fully implemented. Manifest expanded significantly.**

### New Required Field
- `layer` (integer: 1, 2, or 3) — now a required manifest field.

### New Optional Fields
- `actions` — Action surface block: `{ commands, events, accepts, slots }`.
- `lifecycle` — Array of lifecycle method names this module implements.
- `dataFiles` — Paths to external JSON data files loaded at runtime.
- `backendDeps` — Backend dependency declarations for adapter modules.
- `requires` — v4.0 alias for `dependencies`.

### Architecture Changes
- Three-layer architecture formalized in code: L1=Features, L2=Primitives, L3=Backend.
- Router auto-discovery: snake_case IPC message type → PascalCase workflow ID. No manual switch statements.
- Variant policy formalized: variants live in `parent/variants/` subdirectory; `variant_of` field required.
- Registrar two-tier ingestion pipeline: ProbationOfficer gate before portfolio acceptance.
- SemVer comparison for champion variant arbitration with optimization priority tie-break.

### Line Limits (v4.0 — later raised by v4.1 Amendment)
- Layer 1 (features): 200 lines
- Layer 2 (primitives): 150 lines
- Layer 3 (backend): 200 lines

### Migration
- Phases 0-9 required to achieve full v4.0 compliance from v3.0.
- Primary migration task: add `layer` field to all existing manifests.

---

## v3.0 — April 2026

**Sovereignty boundaries documented. Registrar pipeline introduced.**

- Sovereignty zones formally defined: UI, SUBSTRATE, EVOLUTION, AUTHORITIES, ENVIRONMENT.
- Prohibited directories documented: `/assets/`, `/static/`, `/deps/`, `/resources/`, `/misc/`, `/global/`.
- Registrar two-tier ingestion pipeline introduced (ProbationOfficer + portfolio acceptance).
- Cross-sovereign communication rules: EventBus, StateStore API, or manifest interfaces only.
- No module may directly modify another module's internal state.

---

## v2.0 — April 2026

**Three-layer architecture introduced. Layer traffic rules established.**

- Layer 1 (Features), Layer 2 (Primitives), Layer 3 (Adapters/Services/Workflows) defined.
- Layer 2 primitives prohibited from calling `fetch()` or backend services.
- Layer 1 features required to implement `mount()` and `unmount()`.
- IIFE wrapping required for all browser layer modules (non-TypeScript).
- `window.*` global state prohibited — StateStore API required.

---

## v1.0 — March 2026

**Foundation. MANIFEST concept introduced.**

- MANIFEST as the core identity mechanism for every module.
- Initial module types: service, adapter, workflow.
- Sovereignty principle: modules own their own files.
- v1.2 mandatory fields established: `id`, `type`, `version`, `runtime`, `capabilities`, `dependencies`, `docs`, `last_modified`.

---

*This changelog is synthesized from source documents. The single source of truth for the current specification is `documentation/SDOA-Whitepaper-Technical.txt`.*
