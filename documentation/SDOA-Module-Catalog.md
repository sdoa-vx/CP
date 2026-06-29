# SDOA Module Portfolio — Catalog

**Source:** `D:\projects\SDOAvX` (first-party modules only; `_variances\` and third-party SDK clones excluded).
**Compiled:** 2026-06-25, by reading each module's embedded SDOA v5 `MANIFEST` block.
**Purpose:** First single-page view of the existing module library — the asset that feeds "Loop B (Portfolio)" in [SDOA-Platform-Roadmap.md](SDOA-Platform-Roadmap.md). Use the Status column and the cleanup flags to decide what to bring into the engine's catalog.

## Summary

**67 first-party modules** (counting `.js`/`.ts` twins separately) across three sovereign areas. By type: ~31 services (incl. 1 repository, 1 persistence layer), ~17 workflows, 6 adapters, 5 engines, 4 UI primitives, 2 UI features, 1 task/orchestrator, 1 bootstrap utility. Runtimes: **NodeJS, Universal, Python, Browser** (no Rust yet). Status: **63 current**, 3 legacy, 1 variant. After de-duplicating the `.js`/`.ts` twins and legacy/variant copies, the distinct-module count is roughly **55–58**.

This is a substantial, real library — not a cold start. The main reconciliation work is that these carry the **v5 source-manifest** format (embedded `MANIFEST` block; id/type/layer/runtime/operationalRole/lifecycle), whereas the C++ engine's catalog expects `module.json` + a runtime entry. Bridging them is the Registrar/registry-hub workstream.

---

## Authorities (layer 3 — orchestration)

| Module ID | Type | Layer | Runtime | Version | Role | Capabilities (brief) | Status | Path |
|---|---|---|---|---|---|---|---|---|
| index.task | task | 3 | NodeJS | 5.0.0 | savant | Orchestrates tests, blueprint gen, self-healing | current | `authorities\conductor\index.ts` |
| Conductor.service | service | 3 | NodeJS | 5.0.0 | conductor | Event suppression, circuit breakers, mesh coordination | current | `authorities\conductor\Conductor.service.js` |
| bootstrap | utility | 3 | Python | 1.1.0 | bootstrap | Env provisioning, venv/pip, model downloads | current | `authorities\bootstrap\bootstrap.py` |
| Captain.service | service | 3 | Universal | 5.0.0 | captain | Boot orchestration, backend/module status broadcast | current | `authorities\captain\Captain.service.js` |
| Router.service | service | 3 | Universal | 5.0.0 | savant | IPC dispatch, workflow routing, middleware auto-discovery | current | `authorities\router\Router.service.js` |
| Registry.service | service | 3 | NodeJS | 5.0.0 | registrar | Module registration, wasm invoke, proxy interception | current | `authorities\registrar\Registry.service.ts` |
| Registrar.service | service | 3 | NodeJS | 5.1.0 | registrar | Portfolio discovery, verification, quarantine, roster | current | `authorities\registrar\Registrar.service.js` |
| Registrar.service | service | 3 | NodeJS | 5.0.0 | registrar | Portfolio scan, catalog build, optimization suggestions | current | `authorities\registrar\Registrar.service.ts` |
| Registry.service | service | 3 | NodeJS | 5.0.0 | ? | Module registration, wasm invoke, proxy interception | variant | `authorities\registrar\variants\Registry.service.legacy\Registry.service.ts` |

## Substrate — Services

| Module ID | Type | Layer | Runtime | Version | Role | Capabilities (brief) | Status | Path |
|---|---|---|---|---|---|---|---|---|
| LlmSettings | service | 3 | Python | 1.2.0 | savant | Streamlit LLM governance, failover policy settings | current | `substrate\services\LlmSettings.py` |
| Dashboard.service | service | 3 | NodeJS | 5.0.0 | savant | Real-time monitoring HTTP server, registry event forwarding | current | `substrate\services\Dashboard.service.ts` |
| RefactorService | service | 3 | Python | 1.1.2 | savant | propose_refactor via context + LLM bridge | current | `substrate\services\RefactorService.py` |
| ProvisioningService | service | 3 | Python | 1.0.3 | savant | verify_environment, request_provisioning | current | `substrate\services\ProvisioningService.py` |
| SystemHealth | service | 3 | Python | 1.2.0 | savant | render_health_metrics, force_economic_failover | current | `substrate\services\SystemHealth.py` |
| Registry.service | service | 3 | NodeJS | 5.0.0 | registrar | Module registration, service discovery | current | `substrate\services\Registry.service.ts` |
| Evaluator.service | service | 3 | NodeJS | 5.0.0 | savant | Evaluates expressions, returns AlgoSim objects | current | `substrate\services\Evaluator.service.ts` |
| VisualOrchestrator.service | service | 3 | NodeJS | 5.0.0 | savant | Generates blueprint.schema.json from manifests | current | `substrate\services\VisualOrchestrator.service.ts` |
| Logger.service | service | 3 | NodeJS | 5.0.0 | savant | log, updateProgress, session test metrics | current | `substrate\services\Logger.service.ts` |
| Comparators.service | service | 3 | NodeJS | 5.0.0 | savant | compareNumber/String/Boolean/RGB/HSV/HSL/Signal/Rational | current | `substrate\services\Comparators.service.ts` |
| MemoryContextBroker.service | service | 3 | NodeJS | 5.2.0 | savant | Mutation journaling, context compile, bounded cache | current | `substrate\services\MemoryContextBroker.service.js` |
| Memory.repository | repository | 3 | NodeJS | 5.2.0 | savant | Async read/write, retention pruning, drive-agnostic | current | `substrate\services\Memory.repository.js` |
| CommentaryPool.service | service | 3 | NodeJS | 5.0.0 | savant | Parallel side-channel commentary across personas | current | `substrate\services\CommentaryPool.service.js` |
| Sentinel.service | service | 3 | Universal | 5.0.0 | sentinel | Watches EventBus for storms, loops, dead modules | current | `substrate\services\Sentinel.service.js` |
| Prism.service | service | 3 | Universal | 5.0.0 | savant | Declarative schema transform via .map.json | current | `substrate\services\Prism.service.js` |
| Oracle.service | service | 3 | Universal | 5.0.0 | oracle | Query registry, describeModule, capability routing | current | `substrate\services\Oracle.service.js` |
| Chronicle.service | service | 3 | Universal | 5.0.0 | savant | Hash-chained audit ledger: record/replay/verify/snapshot | current | `substrate\services\Chronicle.service.js` |
| PersistentMemory.service | service | 3 | NodeJS | 5.0.0 | savant | Loads identity traits + project memory | current | `substrate\services\PersistentMemory.service.ts` |
| PersistentMemory.service | service | 3 | NodeJS | 5.0.0 | savant | Loads identity traits + project memory | current | `substrate\services\PersistentMemory.service.js` |
| EventBus.service | service | 3 | Universal | 5.0.0 | savant | emit/on/off event publish/subscribe spine | current | `substrate\services\EventBus.service.js` |
| Chronicle.persistence | service | 3 | NodeJS | 5.0.0 | savant | append/load/rotate/checkpoint JSONL persistence | current | `substrate\services\Chronicle.persistence.js` |
| ConfigValidator.service | service | 3 | NodeJS | 5.0.0 | savant | validate/validateAll/getDefaults, auto-repair | current | `substrate\services\ConfigValidator.service.js` |
| AssemblyLine.service | service | 3 | NodeJS | 5.0.0 | assemblyline | spawn/kill process, polyglot subprocess bridge | current | `substrate\services\AssemblyLine.service.js` |

## Substrate — Workflows

| Module ID | Type | Layer | Runtime | Version | Role | Capabilities (brief) | Status | Path |
|---|---|---|---|---|---|---|---|---|
| Coach.workflow | workflow | 3 | Python | 5.0.0 | savant | Diagnose failures, request AI patches, emit mutations | current | `substrate\workflows\Coach.workflow.py` |
| ExplainModuleWorkflow | workflow | 3 | Python | 5.0.0 | savant | explain_module_context via LLM | current | `substrate\workflows\ExplainModuleWorkflow.py` |
| SendMessageWorkflow | workflow | 3 | NodeJS | 5.0.0 | savant | HTTPS LLM chat, context compile, provider routing | current | `substrate\workflows\SendMessage.workflow.ts` |
| SendMessageWorkflow | workflow | 3 | NodeJS | 5.0.0 | savant | HTTPS LLM chat, context compile, provider routing | current | `substrate\workflows\SendMessage.workflow.js` |
| TestCore.workflow | workflow | 3 | NodeJS | 5.0.0 | savant | Single-expression test eval, self-healing feedback | current | `substrate\workflows\TestCore.workflow.ts` |
| TestRunner.workflow | workflow | 3 | NodeJS | 5.0.0 | savant | Batch test suites, chapters, progress tracking | current | `substrate\workflows\TestRunner.workflow.ts` |
| MemoryDistiller.workflow | workflow | 3 | NodeJS | 5.1.0 | savant | Lossless memory compression, ecosystem metrics | current | `substrate\workflows\MemoryDistiller.workflow.js` |
| GoogleDriveWorkflow | workflow | 3 | NodeJS | 5.0.0 | savant | Drive OAuth, file list, download | current | `substrate\workflows\GoogleDrive.workflow.js` |
| Cartographer.workflow | workflow | 3 | NodeJS | 5.0.0 | savant | Topology graph, dependency analysis, JSON/SVG render | current | `substrate\workflows\Cartographer.workflow.js` |
| TestCore.workflow | workflow | 3 | NodeJS | 5.0.0 | savant | Auto-discover suites, pipe failures to Coach | current | `substrate\workflows\TestCore.workflow.js` |
| Scaffold.workflow | workflow | 3 | NodeJS | 5.0.0 | savant | AI module generator, LLM spec synthesis, validation | current | `substrate\workflows\Scaffold.workflow.js` |
| Interpreter.workflow | workflow | 3 | NodeJS | 5.0.0 | savant | NL → SDOA command dispatch with guardrails | current | `substrate\workflows\Interpreter.workflow.js` |
| Triage.workflow | workflow | 3 | NodeJS | 5.0.0 | triage | Request routing via Pulse telemetry, circuit breakers | current | `substrate\workflows\Triage.workflow.js` |
| ProbationOfficer.workflow | workflow | 3 | NodeJS | 5.0.0 | probation-officer | Static analysis gate, sandbox, AST validation | current | `substrate\workflows\ProbationOfficer.workflow.js` |
| Pulse.workflow | workflow | 3 | NodeJS | 5.0.0 | savant | Telemetry aggregation, latency percentiles, error rates | current | `substrate\workflows\Pulse.workflow.js` |

## Substrate — Engines & Adapters

| Module ID | Type | Layer | Runtime | Version | Role | Capabilities (brief) | Status | Path |
|---|---|---|---|---|---|---|---|---|
| qwen_server.engine | engine | 3 | Python | 1.2.0 | savant | local_llm_inference, http_api | current | `substrate\engines\qwen_server.py` |
| ContextEngine | engine | 3 | Python | 1.2.2 | savant | get_refactor_context, semantic retrieval | current | `substrate\engines\ContextEngine.py` |
| LocalLlmServer.engine | engine | 3 | Python | 5.0.0 | savant | local_inference_server, http_endpoint_gen | current | `substrate\engines\LocalLlmServer.engine.py` |
| LocalModelAdapter | adapter | ? | NodeJS | 2.2.0 | ? | generate/stream/estimateTokens/calculateBudget | current | `substrate\adapters\LocalModelAdapter.js` |
| TokenBudget.adapter | adapter | 3 | NodeJS | 5.0.0 | savant | lookupContextLimit, estimateTokens, trimToFit | current | `substrate\adapters\TokenBudget.adapter.js` |
| LlmConnector.adapter | adapter | 3 | NodeJS | 5.0.0 | savant | httpsPost, callAnthropic | current | `substrate\adapters\LlmConnector.adapter.js` |
| LlmConnector.adapter | adapter | 3 | NodeJS | 5.0.0 | savant | httpsPost, callAnthropic/OpenAI/OpenRouter | current | `substrate\adapters\LlmConnector.adapter.ts` |
| TokenBudget.adapter | adapter | 3 | NodeJS | 5.0.0 | savant | lookupContextLimit, estimateTokens, trimToFit | current | `substrate\adapters\TokenBudget.adapter.ts` |
| AiBroker.adapter | adapter | 3 | NodeJS | 5.0.0 | coach | healTestFailure, AI self-healing patches | current | `substrate\adapters\AiBroker.adapter.ts` |
| AiProvider.adapter | adapter | 3 | NodeJS | 5.0.0 | savant | complete/stream/listModels, multi-provider fallback | current | `substrate\adapters\AiProvider.adapter.js` |
| AiBroker.adapter | adapter | 3 | NodeJS | 5.0.0 | coach | healTestFailure, AI self-healing patches | legacy | `substrate\adapters\variants\AiBroker.legacy\AiBroker.adapter.ts` |

## UI

| Module ID | Type | Layer | Runtime | Version | Role | Capabilities (brief) | Status | Path |
|---|---|---|---|---|---|---|---|---|
| Playground.feature | feature | ? | Browser | 5.0.0 | ? | Live command executor, Swagger UI, EventBus dispatch | current | `ui\features\Playground\Playground.feature.js` |
| Blueprint.feature | feature | 1 | Browser | 5.0.0 | savant | Draggable SVG node graph, event wiring, save schema | current | `ui\features\Blueprint\Blueprint.feature.js` |
| LlmSettings | service | 3 | Python | 1.2.0 | savant | Streamlit LLM governance, failover settings | current | `ui\dashboards\LlmSettings.py` |
| StatusBar.prim | primitive | 2 | Browser | 5.0.0 | savant | setModuleCount/BackendStatus/SovereignStatus | current | `ui\primitives\StatusBar\StatusBar.prim.js` |
| Diff.prim | primitive | ? | Browser | 5.0.0 | ? | Side-by-side LCS diff, Accept/Reject mutations | current | `ui\primitives\Diff\Diff.prim.js` |
| Timeline.prim | primitive | 2 | Browser | 5.0.0 | savant | loadEntries/appendEntry, swimlane event stream | current | `ui\primitives\Timeline\Timeline.prim.js` |
| CommandPalette.prim | primitive | 2 | Browser | 5.0.0 | savant | open/close/refreshIndex, ⌘K launcher | current | `ui\primitives\CommandPalette\CommandPalette.prim.js` |

## Evolution / Legacy (Status = legacy)

| Module ID | Type | Layer | Runtime | Version | Role | Capabilities (brief) | Status | Path |
|---|---|---|---|---|---|---|---|---|
| Registry.service | service | 3 | NodeJS | 5.0.0 | ? | Module registration, wasm invoke, polyglot bridge | legacy | `evolution\legacy\sdoa-core\src\registry.ts` |
| EventBus.service | service | 3 | Universal | 5.0.0 | savant | on/once/emit, command dispatch, event history | legacy | `evolution\legacy\sdoa-core\src\eventbus.ts` |

---

## Cleanup flags (resolve before importing into the catalog)

**`.js`/`.ts` twins — pick one canonical per module:** `LlmConnector.adapter` (the `.ts` lists more providers), `TokenBudget.adapter` (identical), `PersistentMemory.service` (identical), `SendMessageWorkflow` (`.js` is transpiled output), `TestCore.workflow` (capabilities differ — `.js` adds Coach auto-discovery).

**Identity collisions — same `id` registered from multiple live paths:**
- `Registry.service` appears at `authorities\registrar\`, `substrate\services\`, and `evolution\legacy\` — a likely registration conflict.
- `Registrar.service` (newer, v5.1.0) and `Registry.service` (older) coexist in `authorities\registrar\`; confirm which is the canonical registrar.
- `LlmSettings` is duplicated across `substrate\services\` and `ui\dashboards\` with identical manifests.

**Incomplete / ambiguous manifests (need a field pass):** `LocalModelAdapter.js` (no parseable MANIFEST; off-line version 2.2.0), `Playground.feature.js`, `Diff.prim.js` (layer/role not in header), the `variants\Registry.service.legacy` and `evolution\legacy\registry.ts` (no `operationalRole`), `bootstrap.py` (manifest is a commented block, non-standard type `utility`).

**Versioning split:** Python modules run independent 1.x versions; NodeJS/Universal/Browser modules track the 5.x platform line (`LocalLlmServer.engine.py` is the lone Python module on 5.0.0).

## What this means for the library

These ~55 distinct modules are Loop B's existing inventory — orchestration (Conductor, Captain, Router, Registrar), memory/persistence (Chronicle, MemoryContextBroker, PersistentMemory), governance (Sentinel, ProbationOfficer, Oracle, Pulse, Triage), LLM plumbing (AiProvider, LlmConnector, TokenBudget, LocalLlmServer), tooling (Scaffold, Cartographer, Interpreter, TestRunner), and a UI kit (Blueprint, Playground, primitives). The next decision is the **format bridge**: how a v5 source-manifest module becomes a first-class entry in the C++ engine's catalog, with runtime routing (Python binding / Node binding / native) chosen by the manifest's `runtime` field. That is the registry-as-hub workstream in the roadmap.
