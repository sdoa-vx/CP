# SDOA Exemplars

This directory contains verbatim copies of canonical SDOA v5.0 source files from `C:\SDOAvX`. These are the reference implementations — use them to understand how real SDOA modules are structured.

## Core Infrastructure (`_variances/SDOAvX/sdoa-core/src/`)

| File | Source | Description |
|------|--------|-------------|
| `base.ts` | `_variances/SDOAvX/sdoa-core/src/base.ts` | SdoaModule base class and subclasses (Service, Adapter, Task, Component, Engine, Primitive, Feature) |
| `eventbus.ts` | `_variances/SDOAvX/sdoa-core/src/eventbus.ts` | Universal EventBus with on/off/once/onAny/emit/command/bridge/getHistory |
| `registry.ts` | `_variances/SDOAvX/sdoa-core/src/registry.ts` | Registry with register/registerPolyglot/registerWasm/get/initAll/disposeAll. SdoaManifest interface. |
| `response.ts` | `_variances/SDOAvX/sdoa-core/src/response.ts` | ResponseFormatter with ok/fail/writeResponse/writeError/writeSuccess/writeEvent |
| `polyglot.ts` | `_variances/SDOAvX/sdoa-core/src/polyglot.ts` | PolyglotBridge — spawns Python subprocess, stdin/stdout JSON protocol |
| `linter.ts` | `_variances/SDOAvX/sdoa-core/src/linter.ts` | SDOA compliance linter — lintContent/lintFile. All layer checks. |

## System Entry Point

| File | Source | Description |
|------|--------|-------------|
| `conductor.index.ts` | `authorities/conductor/index.ts` | ConductorTask — registers all modules, registers WasmSolver.engine, calls initAll(), runs tests |

## Substrate Services

| File | Source | Description |
|------|--------|-------------|
| `Comparators.service.ts` | `substrate/services/Comparators.service.ts` | Type-specific comparators (number, string, boolean, array, RGB, HSV, HSL, signal, rational) |
| `Logger.service.ts` | `substrate/services/Logger.service.ts` | Test logging and progress tracking. Broadcasts test-run and progress-update events. |
| `Evaluator.service.ts` | `substrate/services/Evaluator.service.ts` | Stateless AlgoSim expression evaluator. Returns TAlgosimObject. |
| `PersistentMemory.service.ts` | `substrate/services/PersistentMemory.service.ts` | Loads identity and project memory for LLM context compilation. |

## Substrate Adapters

| File | Source | Description |
|------|--------|-------------|
| `AiBroker.adapter.ts` | `substrate/adapters/AiBroker.adapter.ts` | AI self-healing broker. On test failure: loads GGUF model, gets JSON patch from LLM, hot-swaps registry. |
| `LlmConnector.adapter.ts` | `substrate/adapters/LlmConnector.adapter.ts` | Low-level HTTPS + SSE connector for Anthropic, OpenAI, and OpenRouter. Context overflow retry. |
| `TokenBudget.adapter.ts` | `substrate/adapters/TokenBudget.adapter.ts` | Model context limits map. lookupContextLimit/estimateTokens/trimToFit. |

## Substrate Workflows

| File | Source | Description |
|------|--------|-------------|
| `TestCore.workflow.ts` | `substrate/workflows/TestCore.workflow.ts` | Runs a single test case. Calls AiBroker.healTestFailure on failure. |
| `TestRunner.workflow.ts` | `substrate/workflows/TestRunner.workflow.ts` | Runs a batch of tests with chapter demarcations and progress events. |
| `SendMessage.workflow.ts` | `substrate/workflows/SendMessage.workflow.ts` | LLM chat orchestrator. Detects provider, compiles context, routes to callAnthropic or callOpenAICompat. |

## Key Patterns to Observe

### Layer 3 Module Pattern (services, adapters, workflows)
- `static MANIFEST = { ... }` declared as class static property
- `async init(registry: Registry): Promise<void>` — receives registry, resolves dependencies
- `async run(payload): Promise<any>` — responds to IPC dispatch (workflows)
- `async dispose(): Promise<void>` — teardown
- `module.exports = ClassName` (JS) or `export class ClassName` (TS)

### Manifest Fields Present in All Exemplars
- `id`, `type`, `layer`, `runtime`, `version` — required
- `operationalRole` — v5.0 field (usually "savant" for domain modules)
- `requires` — dependency IDs (v4.0 name)
- `lifecycle` — declared lifecycle methods
- `actions.commands` — callable methods with input/output shapes
- `optimization.priority` + `optimization.assertionSuite` — v5.0 field
- `docs.description`, `docs.author`, `docs.sdoa` — documentation

### SdoaManifest TypeScript Interface (from registry.ts)
The `SdoaManifest` interface in `registry.ts` is the canonical TypeScript definition of all manifest fields and their types.
