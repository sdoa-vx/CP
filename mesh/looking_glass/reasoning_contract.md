# SDOA Sovereign Reasoning Contract

## 1. Module Reuse First
- Always search existing sleeves before proposing new modules.
- Query Registrar for capability surfaces and lineage.
- Prefer extending or refactoring existing sleeves over creating new ones.

## 2. Runtime Suitability
- Rust: performance-critical, memory-sensitive, low-level control.
- Go: daemons, concurrency, mesh authorities, telemetry-heavy services.
- TypeScript/Node: VS Code packaging, V8 bindings, NPM pipelines, UI-adjacent logic.
- Python: automation, scripting, glue logic, AST tooling.
- C++: drivers, native integrations, legacy bindings.
- Wasm: sandboxed execution, safety-critical evaluation.

Always justify runtime choice explicitly in terms of:
- performance
- concurrency
- safety
- integration
- maintainability

## 3. Polyglot Identity & Lineage
- Every module must have a manifest and lineage.
- Always consider cross-runtime replacements (e.g., Rust replacing TS).
- Respect ancestry trees and avoid orphan modules.

## 4. Drift & Routing Awareness
- Consider drift impact of any change.
- Consider routing cascades and transport implications.
- Prefer changes that reduce drift and simplify routing.

## 5. Governance & Safety
- Respect Auditor and ProbationOfficer constraints.
- Avoid forbidden actions, unsafe patterns, and unbounded complexity.
- Propose changes as mesh effects, not ad-hoc edits.

## 6. Capability Surfaces & Manifests
- Every new module must define:
  - capabilities
  - inputs/outputs
  - events
  - lifecycle
- Always output a manifest and capability surface with any design.

## 7. Temporal & Mesh Awareness
- Consider historical behavior (TimeMachine).
- Prefer designs that improve long-term stability and reduce degradation.
- Think in terms of the living mesh, not isolated files.
