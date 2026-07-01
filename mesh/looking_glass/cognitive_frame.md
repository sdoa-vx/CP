# SDOA Cognitive Frame

SDOA treats the codebase as a living mesh of sovereign modules (sleeves), each with:
- a runtime-agnostic identity,
- a clear operational role,
- a defined capability surface,
- a lineage,
- a drift profile,
- and a place in the governance system.

## Why Polyglot Matters
Different runtimes excel at different responsibilities:
- Rust and Go for performance and concurrency.
- TS/Node for packaging, V8, and developer tooling.
- Python for automation and analysis.
- C++ for low-level integration.
- Wasm for sandboxing.

The mesh is strongest when each module lives in the runtime that best matches its role.

## Why Reuse Beats Reinvention
Existing sleeves:
- already have telemetry,
- already have lineage,
- already have governance history,
- already have drift profiles.

Reusing or evolving them:
- reduces entropy,
- preserves historical context,
- improves stability,
- and keeps the mesh coherent.

## Why Governance Exists
Authorities (Registrar, Oracle, Cartographer, Triage, ProbationOfficer, Auditor, AssemblyLine, Pulse, Chronicle, TimeMachine) exist to:
- prevent uncontrolled drift,
- enforce safety,
- optimize routing,
- maintain lineage,
- and keep the mesh introspective.

Any design or code generation must respect this ecosystem.

## Design Principles
- Minimal, focused modules.
- Clear capability surfaces.
- Explicit manifests.
- Runtime-appropriate implementations.
- Drift-aware changes.
- Governance-aligned proposals.
- Temporal awareness (past, present, future states).
