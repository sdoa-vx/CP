# SDOA Dashboard Trace Protocol — v1

**Status:** Phase 4.2 design, ratified against the v1.0.1 execution engine
**Date:** 2026-06-24
**Scope:** The contract between the SDOA execution engine and any trace consumer (web dashboard, VS Code extension, log sink, replay tool).

This document defines three things: the **event schema** the engine emits, the **ordering guarantees** a consumer may rely on, and the **UI consumption model** a dashboard should implement. It describes the protocol *as the engine actually emits it today*, then lists recommended transport-layer additions kept separate so the two are never confused.

---

## 1. Event Schema

### 1.1 Emission surfaces

The engine exposes traces through two equivalent surfaces, both driven by the same internal `emit_trace` call:

1. **Live hook** — `Engine::set_trace_hook(fn)`. `fn` is invoked synchronously during execution with the signature:

   ```
   void(const std::string& pipeline_id,
        const std::string& step_id,
        const std::string& event_type,
        const nlohmann::json& context)
   ```

2. **Replayable log** — `ExecutionResult::trace`, a JSON array. Each element is one event object (see below). This is the durable form: it is fully populated when `run_pipeline` returns and is serialized into the C ABI via `sdoa_result_to_json` under the `"trace"` key.

The two surfaces carry identical information. The hook is for live streaming; the array is for replay and post-hoc inspection.

### 1.2 Event object

Every element of `ExecutionResult.trace` has this shape:

```json
{
  "pipeline_id": "MyPipeline",
  "step_id": "StepA",
  "event_type": "STEP_SUCCESS",
  "context": { }
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `pipeline_id` | string | The pipeline being executed. Constant for all events in one run. |
| `step_id` | string | The step the event concerns. Empty string `""` for pipeline-level events. |
| `event_type` | string (enum) | One of the five event types below. |
| `context` | object/any | Event-type-specific payload (see §1.3). |

### 1.3 Event types and their `context`

There are exactly **five** event types. A consumer must treat any unknown `event_type` as informational and ignore it (forward-compatibility rule).

| `event_type` | `step_id` | `context` payload |
|--------------|-----------|-------------------|
| `PIPELINE_START` | `""` | `{}` (empty object) |
| `STEP_START` | step id | The **fully resolved input** to the step (after `@ref` resolution + deep-merge of upstream outputs). This is the exact JSON the capability received. |
| `STEP_SUCCESS` | step id | The capability's **return value** (the step output JSON). |
| `STEP_ERROR` | step id | `{ "error": "<message>" }` |
| `PIPELINE_COMPLETE` | `""` | `{ "success": true, "outputs": { "<step>": <output>, ... } }` on success, or `{ "success": false, "error": "<message>" }` on failure. |

Notes:
- `STEP_START.context` is the resolved input, not the static template — so the dashboard shows what actually flowed into the step, including values pulled from upstream steps.
- `PIPELINE_COMPLETE.outputs` mirrors `ExecutionResult.outputs` exactly.

---

### 1.4 Capability metadata enrichment (v5.3)

Step-level events in the **`trace` array** carry an extra sibling field `capability` describing the capability that ran (so the dashboard can show which language/module executed and its determinism profile):

```json
{
  "pipeline_id": "P", "step_id": "S", "event_type": "STEP_START",
  "context": { },
  "capability": {
    "module": "Py", "capability": "score",
    "origin": "foreign",      // builtin | foreign
    "language": "python",     // cpp | python | node | rust | foreign | ...
    "flags": { "pure": true, "side_effecting": false, "nondeterministic": false }
  }
}
```

Rules:
- Present on step events (`STEP_START`, `STEP_SUCCESS`, `STEP_ERROR`); **absent** on pipeline-level events (`PIPELINE_START`/`PIPELINE_COMPLETE`, whose `step_id` is `""`).
- Lives on the durable `trace` array only. The live `TraceHookFn` signature is unchanged (v1-compatible); consumers needing flags live can join against the `sdoa_engine_capabilities_json` manifest by `module::capability`.
- Additive and optional — consumers that don't use it can ignore it.

## 2. Ordering Guarantees

The engine is multithreaded (a per-run thread pool). The following guarantees hold in the `trace` array order and in hook-invocation order. **A consumer may rely only on the guarantees listed here**; anything not listed is unspecified.

### 2.1 Guaranteed

1. **Pipeline brackets.** `PIPELINE_START` is the first event. `PIPELINE_COMPLETE` is the last event. Exactly one of each per run.
2. **Per-step start-before-finish.** For any step that begins executing, its `STEP_START` precedes its terminal event (`STEP_SUCCESS` or `STEP_ERROR`).
3. **One terminal per executed step.** A step that runs emits exactly one of `STEP_SUCCESS` or `STEP_ERROR` — never both.
4. **Causal (dependency) ordering.** A step's `STEP_START` always appears *after* the `STEP_SUCCESS` of every one of its DAG parents. This is structural: a step only becomes ready once all parents have completed and propagated their output. Therefore the event stream is a valid topological witness of the DAG.
5. **Determinism of outcomes.** Step outputs and the final `PIPELINE_COMPLETE` payload are deterministic for a given pipeline + input, regardless of thread count. (Verified by the engine's determinism tests.)

### 2.2 NOT guaranteed (must be handled)

1. **Interleaving of concurrent branches.** When two independent steps run in parallel, the relative order of their events is **not** deterministic across runs and depends on thread scheduling. Only per-step and causal ordering (§2.1.2, §2.1.4) hold. With `thread_count = 1` the order becomes deterministic (lexicographic by ready-queue), which is useful for golden-file tests, but consumers must not depend on it in general.
2. **`STEP_ERROR` without a preceding `STEP_START`.** If a step fails during **input resolution** (a bad `@ref`, missing upstream field, malformed reference), the engine emits `STEP_ERROR` for that step *without* a prior `STEP_START`, because the step never received a resolved input. Consumers must treat `STEP_ERROR` as terminal for the step whether or not a `STEP_START` was seen.
3. **Events after the first error.** Execution fails fast on first error, but steps already in flight on other threads may still emit their terminal events before `PIPELINE_COMPLETE`. Steps downstream of the failed step never start. So a failed run may contain a mix of `STEP_SUCCESS`, one or more `STEP_ERROR`, and steps with no events at all. `PIPELINE_COMPLETE.success` is the authoritative verdict.

---

## 3. UI Consumption Model

The dashboard should treat the trace as an **event-sourced fold**: maintain a state object and reduce events into it. The same reducer works for live streaming (fold incrementally as hook events arrive) and replay (fold the whole `trace` array). This is the recommended model for both the web dashboard and the VS Code extension.

### 3.1 Reducer state

```
PipelineView {
  pipeline_id: string
  status: "running" | "succeeded" | "failed"
  steps: Map<step_id, StepView>
  error?: string
  outputs?: object
}
StepView {
  status: "pending" | "running" | "succeeded" | "failed"
  input?: object     // from STEP_START
  output?: object    // from STEP_SUCCESS
  error?: string     // from STEP_ERROR
}
```

Steps not present in the DAG view start as `pending` (the dashboard knows the DAG from the pipeline definition; the trace fills in runtime state).

### 3.2 Reduction rules

| Event | State transition |
|-------|------------------|
| `PIPELINE_START` | `status = running`; mark all known steps `pending`. |
| `STEP_START` | `steps[id].status = running`; `steps[id].input = context`. |
| `STEP_SUCCESS` | `steps[id].status = succeeded`; `steps[id].output = context`. |
| `STEP_ERROR` | `steps[id].status = failed`; `steps[id].error = context.error`. (Create the StepView if it doesn't exist — see §2.2.2.) |
| `PIPELINE_COMPLETE` | `status = context.success ? succeeded : failed`; store `outputs`/`error`. |

Because the reducer only ever *advances* a step's state and the engine guarantees causal ordering, out-of-order arrival between unrelated steps is harmless — each step's own events arrive in order.

### 3.3 Rendering

- Render the DAG; color nodes by `StepView.status` (pending = grey, running = pulsing/blue, succeeded = green, failed = red).
- On node click, show `input` and `output` (or `error`) from the StepView — these are the real resolved values, ideal for debugging dataflow.
- Show a live event tail (the raw stream) alongside the DAG for low-level inspection.
- On `PIPELINE_COMPLETE`, surface `success` prominently; if failed, highlight the failed step(s) and the `error`.

### 3.4 Transport (recommended, not part of engine v1)

The engine emits in-process events; a server bridges them to clients. Recommended envelope for the wire (SSE/WebSocket), wrapping the engine event without changing it:

```json
{
  "schema_version": 1,
  "seq": 17,
  "ts": "2026-06-24T07:00:00.123Z",
  "event": { "pipeline_id": "...", "step_id": "...", "event_type": "...", "context": {} }
}
```

- `seq` — monotonic per-run counter assigned at the bridge, so clients can detect drops and order events from a single run reliably even over an unordered transport.
- `ts` — wall-clock timestamp assigned at the bridge. The engine core deliberately emits **no timestamps** (it stays clock-free for determinism); timing is a transport concern.
- `schema_version` — lets clients negotiate future changes.

These three fields are added by the dashboard server (e.g. the existing `/dashboard/api/events` SSE endpoint), never by the engine. Keeping wall-clock and sequencing out of the engine preserves its deterministic, side-effect-free contract.

### 3.5 Run identity

A single `pipeline_id` may be executed many times. The bridge should assign a `run_id` (UUID) per `run_pipeline` invocation and include it in the envelope so the UI can separate concurrent or historical runs of the same pipeline. (Also a transport concern; not emitted by the engine.)

---

## 4. Compatibility Rules

- **Additive only.** New `event_type` values or new `context` fields may be added in future engine versions. Consumers must ignore unknown event types and unknown fields.
- **The five core event types are stable.** Their names and `step_id` conventions will not change within protocol v1.
- **Removing or renaming** any of the five event types, or changing the `context` contract of an existing type, is a breaking change requiring a `schema_version` bump and the SDOA amendment process.
