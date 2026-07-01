# Changelog

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
