# SDOA `sdoa run` — Phase R Execution Surface

**Status:** Implemented and tested.
**Date:** 2026-06-25
**Phase:** R (Execution Surface) — the prerequisite for Phase M (MCP Server) and Phase G (Visual Builder).

The single missing verb. `sdoa run` takes a pipeline JSON file and global input, spins up an embedded engine, executes the pipeline, and returns the result as a structured JSON document on stdout. This is the run contract every future surface (MCP server, drag-and-drop builder, agent loop) calls into.

---

## Usage

```bash
sdoa run <pipeline.json> [options]
```

| Flag | Default | Meaning |
|---|---|---|
| `--input <in.json>` | `{}` | JSON object to pass as the pipeline's global input |
| `--modules <dir>` | `modules` | Directory of installed modules to load |
| `--pipeline <id>` | (first) | When the file contains a `{"pipelines":[...]}` bag, select by id |
| `--strict` | off | Inject `"strict": true` onto the pipeline (rejects nondeterministic capabilities) |
| `--trace` | off | Include the `trace` array (all step events) in the output |
| `--inline` | off | Run on the calling thread (needed for single-threaded bindings) |
| `--no-stdlib` | off | Skip stdlib installation (use when engine is loaded bare) |

---

## Pipeline file formats

Both formats are accepted:

**1. Single pipeline object** (simpler — write this by hand or via codegen):
```json
{
  "id": "MyPipeline",
  "steps": [
    { "id": "A", "module_id": "Math", "capability": "add", "input": { "a": 2, "b": 3 } }
  ],
  "edges": []
}
```

**2. Pipelines bag** (the engine's native format, from `sdoa validate pipeline`):
```json
{
  "pipelines": [
    { "id": "P1", "steps": [...], "edges": [] },
    { "id": "P2", "steps": [...], "edges": [] }
  ]
}
```

When using format 2 with multiple pipelines, pass `--pipeline <id>` to select one. The first pipeline is used by default.

> **Note on model docs:** The engine internally requires a domain/module model declaration. `sdoa run` auto-generates this from the `module_id` values found in your pipeline steps — you never have to write one.

---

## Output (run contract)

### Success
```json
{
  "ok": true,
  "pipeline_id": "MyPipeline",
  "outputs": {
    "A": { "result": 5 }
  }
}
```

### Failure
```json
{
  "ok": false,
  "pipeline_id": "MyPipeline",
  "error": {
    "code": "PIPELINE_FAILED",
    "details": "STEP_ERROR in step 'A': SCHEMA_VALIDATION_FAILED ..."
  }
}
```

### With `--trace`
```json
{
  "ok": true,
  "pipeline_id": "MyPipeline",
  "outputs": { "A": { "result": 5 } },
  "trace": [
    { "pipeline_id": "MyPipeline", "step_id": "", "event_type": "PIPELINE_START", "context": {} },
    { "pipeline_id": "MyPipeline", "step_id": "A", "event_type": "STEP_START",    "context": { "a": 2, "b": 3 } },
    { "pipeline_id": "MyPipeline", "step_id": "A", "event_type": "STEP_SUCCESS",  "context": { "result": 5 } },
    { "pipeline_id": "MyPipeline", "step_id": "", "event_type": "PIPELINE_COMPLETE", "context": { "success": true, "outputs": { "A": { "result": 5 } } } }
  ]
}
```

**Exit codes:** `0` = pipeline succeeded; `1` = pipeline failed or CLI error.

---

## Examples

### Stdlib-only, inline pipeline file
```bash
sdoa run my-pipeline.json
```

### With module capabilities
```bash
sdoa run my-pipeline.json --modules ./modules
```

### Provide input data
```bash
sdoa run my-pipeline.json --input data.json
```

### Strict + trace (fully reproducible, inspectable)
```bash
sdoa run my-pipeline.json --strict --trace
```

### Select one pipeline from a multi-pipeline file
```bash
sdoa run all-pipelines.json --pipeline transform-data
```

### Capture the result to a file
```bash
sdoa run my-pipeline.json > result.json
```

---

## Sample pipeline (copy-paste ready)

Save as `hello.json` and run `sdoa run hello.json`:

```json
{
  "id": "hello",
  "steps": [
    { "id": "greet", "module_id": "String", "capability": "concat",
      "input": { "parts": ["Hello, ", "world!"], "separator": "" } },
    { "id": "shout", "module_id": "String", "capability": "to_upper",
      "input": { "text": "@greet.result" } }
  ],
  "edges": [{ "from": "greet", "to": "shout" }]
}
```

Expected output:
```json
{
  "ok": true,
  "pipeline_id": "hello",
  "outputs": {
    "greet": { "result": "Hello, world!" },
    "shout": { "result": "HELLO, WORLD!" }
  }
}
```

---

## How this enables the next phases

| What | How |
|---|---|
| **Phase M — MCP Server** | The MCP `sdoa_run_pipeline` tool is a thin wrapper over this same run contract. An agent calls `list_capabilities` → assembles pipeline JSON → calls `run_pipeline` → gets the run-contract result back. No new engine code needed. |
| **Phase G — Visual Builder** | The canvas emits pipeline JSON; the "Run" button calls `sdoa run` (or the MCP equivalent) and displays the result using the trace protocol already defined in `Dashboard-Trace-Protocol.md`. |
| **Scanner/Console (Loop B)** | Deterministic steps in the Scanner can be expressed as engine pipelines and executed via `sdoa run`, making the engine the Scanner's execution backend. |

---

## Honest boundary

`sdoa run` uses a single-threaded engine (thread_count=1). For CPU-bound parallel pipelines with many independent steps, the threaded executor runs faster. For CLI use, single-thread is correct and deterministic.

Sandbox enforcement at run time is the in-process policy layer (Phase 6.1). True syscall confinement of native modules requires the out-of-process `modhost` path (Phase 6.5). See `Isolation.md` for the honest boundary.
