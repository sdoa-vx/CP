# Changelog

## [1.4.9]
- **Dual-channel scan telemetry:** live scan progress now runs over SSE (previously wired to a
  Supabase realtime subscription that never actually received scan events), with Chronicle as
  a durable secondary record and automatic failover between the two.
- **Fix: VS Code command bridge silently dropped every dispatched command** — a missing error
  handler on the extension's WebSocket client killed its reconnect loop on the very first
  (always-failing) connection attempt. The dashboard now also reports an honest failure instead
  of a false "success" toast when the extension isn't connected.
- **Fix: the scanner was structurally disconnected from its own output.** Scan-generated
  proposals were written only to a Supabase cloud table while the dashboard read from a
  different local table; the `modules` catalog used for reuse-matching didn't exist; the
  extension had a second, dead scan path hitting a removed endpoint; and `mesh/looking_glass`
  was excluded from the packaged extension, so the AI pipeline call failed silently on every
  file. All of these are now wired correctly end-to-end.
- **Hardening:** scanning a very large folder or an entire drive no longer freezes the server —
  file enumeration is now fully async, with a fast pre-flight size/drive-root check and a
  confirmation prompt before scanning anything huge.
- **Adaptive offline sync:** replaced the flat 3-minute polling interval with an event-driven
  flush (immediate on new data, exponential backoff under real failure, drains fully once
  reachable again).
- **Fix: Proposals dashboard view was always empty** despite correct counts — same root cause
  as the scan telemetry issue; now hydrated from the real local database with live SSE updates.
- **Fix: native dialogs (folder picker, large-scan confirmation) could open behind other
  windows** on Windows when triggered from the browser dashboard — VS Code is now brought to
  the foreground first.

## [1.4.7]
- Fix: Resolved IDE warnings including missing extension icon, rootDir TypeScript constraint, and dashboard spellings.

## [1.4.6]
- Fix: Updated extension README for marketplace compliance (removed SVGs).
- Documentation: Added comprehensive version history to CHANGELOG.md.

## [1.4.5]
- Fix: scanner now generates SDOA proposals via semantic similarity + module extraction.

## [1.4.0] — Scanner 2.0 + Looking Glass Integration
**Critical Fix Release**
This is the emergency fix for the broken scanner.

### Scanner 2.0
Replaced dumb keyword counter with:
- semantic similarity
- module reuse detection
- new module extraction
- proposal generation
Scanner now calls Looking Glass for every file.

### Looking Glass (Savant Sleeve)
- Enforces Sovereign Reasoning Contract.
- Injects mesh context (sleeves, pulse scores, chronicle).
- Calls semanticSimilarity.ts.
- Calls CreationPipeline.ts.
- Generates manifests + capability surfaces.
- Inserts proposals into Supabase.

### Dashboard Upgrade
- Proposal feed
- Mesh logs console
- Pulse score visualizer
- Transport negotiation visualizer
- Batch flow panel
- TimeMachine scrubber improvements

### SRC (Sovereign Reasoning Contract)
- Runtime heuristics
- Module reuse mandate
- Drift/routing awareness
- Governance alignment
- Capability surface requirement

### TimeMachine
- Faster block loading
- Improved topology reconstruction
- Drift rewind accuracy
- Governance pulse replay

### Pulse
- Full scoring loop
- Transport stability scoring
- Batch bonuses
- Drift penalties
- Champion selection

### Chronicle
- Unified event normalization
- High-volume ingestion
- Mesh effect logging
- TimeMachine metadata

### Polyglot Sovereign Roles
- Runtime-agnostic capability surfaces
- Cross-runtime lineage
- Polyglot governance
- Transport independence

## [1.3.5] — Phase 8: Universal Compiler + Release Pipeline
**Packaging & Distribution**
- Added build_mesh.ps1 universal compiler.
- Added start_mesh.ps1 bring-up script.
- Added .env loader for Supabase credentials.
- Published SDOA MCE v1.3.0 to Open VSX Registry.

## [1.3.4] — Phase 7: Sovereign Loop Activation
**Full Mesh Bring-Up**
- Fired mock sovereign loop:
  - scan:start
  - proposal:created
  - governance:approved
  - build:complete
  - sleeve:spawned
  - triage:routingCascade
  - driftTrend
  - transportNegotiated
  - batchExecuted
  - timemachine:rewind
- Confirmed all 12 authorities are alive and reacting.

## [1.3.3] — Phase 6: Supabase Wiring
**Mesh → Cloud Integration**
- Wired all 12 authorities to Supabase:
  - sleeves
  - chronicle_events
  - pulse_scores
  - transport_events
  - batch_events
  - lifecycle_events
  - governance_events
  - mesh_effects
- Added unified logging (mesh_logs).
- Activated tracksdoa‑v2 UI subscriptions.

## [1.3.2] — Phase 5: Chronicle, Pulse, TimeMachine
**Spine, Brain, Memory**
- **Chronicle (Spine):**
  - real-time ingestion
  - event normalization
  - historical ledger
- **Pulse (Brain):**
  - S_base
  - P_drift
  - M_transport
  - B_batch
  - champion selection
- **TimeMachine (Memory):**
  - chronicle range queries
  - topology reconstruction
  - governance pulse replay
  - drift rewind

## [1.3.1] — Phase 4: Mesh Intelligence
**Lifecycle, Transport, Batch Engines**
- **Sleeve Lifecycle Manager (Go):** spawn/retire/failover/rotation
- **Transport Arbitration Engine (Go):** latency scoring, drift penalties, transport negotiation
- **Batch Execution Engine (Go):** compression, batch execution, drift scoring

## [1.3.0] — Phase 3: Polyglot Operationalization
**Provisioner + Builder + Subprocess Engine**
- **Implemented Provisioner (Go):** sleeve creation, runtime resolution, Registrar + Oracle + Cartographer integration
- **Implemented Builder (Go):** polyglot build lanes (Rust, Go, TS, Python, C++, Wasm), subprocess concurrency, artifact packaging
- Added build telemetry events.
*(This is the version 126 people downloaded.)*

## [1.2.0] — Phase 2: Governance & Safety
**Sandboxing, Gatekeeping, Compliance**
- **Scaffolded ProbationOfficer (Go):** sandbox.go, gate.go, safety enforcement
- **Scaffolded Auditor (TS):** schema validation, manifest compliance
- Added governance pulse events.

## [1.1.0] — Roadmap & Runtime Designation
**Mesh Planning & Role Assignment**
- Completed the Master Roadmap Plan.
- Assigned operational roles to all authorities.
- Added runtime designations (TS for schema/packaging, Go for concurrency/sandboxing).
- Integrated roadmap into the mesh.

## [1.0.0] — Initial Mesh Scaffolding
**Foundational Architecture**
- Created the first sovereign authorities: AssemblyLine, ProbationOfficer, Auditor
- Added sovereign manifests for each authority.
- Implemented polyglot endpoints (TS + Go).
- Added .vsix packaging pipeline for the MCP extension.
- Established the SDOA runtime roles and identity layer.
