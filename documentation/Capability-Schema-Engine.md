# SDOA Capability Schema Engine (5.B.1)

**Status:** Implemented and tested. Additive and non-breaking.
**Date:** 2026-06-24

Capabilities may carry optional JSON Schemas for their input and output. When present, the engine validates against them at step execution; when absent, behavior is unchanged. Schemas also flow into the capability manifest, making the registry self-documenting (the basis for future tooling/codegen/IDE support).

## 1. Where schemas live

Each capability's `CapabilityMeta` (per-engine registry, sovereign) gains two optional fields: `input_schema` and `output_schema` (parsed JSON objects). Built-in, foreign, and module-provided capabilities can all carry them.

## 2. Attaching schemas

Three additive paths, all at the ABI boundary:

1. **Foreign capability at registration** — `sdoa_cap_desc_v3` adds `input_schema_json` / `output_schema_json` (nullable JSON-object strings), registered via `sdoa_engine_register_foreign_capability_v3`. The v2 descriptor and function are unchanged.
2. **Attach to an existing capability** — `sdoa_engine_set_capability_schema(engine, module, capability, input_json, output_json)`. NULL leaves a schema unchanged.
3. **Module-provided (zero `.so` changes)** — the module loader reads `capabilities/<cap>.json`, extracts `input_schema`/`output_schema`, and calls `set_capability_schema` after the module registers. Module authors just drop schema files alongside the manifest.

Non-object or unparseable schema strings are rejected at registration (`SDOA_ERR_NONCOMPLIANT` / `SDOA_ERR_PARSE_FAILED`).

## 3. Validation points

The spec calls for validating the *resolved* input at "pipeline build." Because resolved inputs depend on upstream `@step.output` references that only exist at execution, the engine validates:

- **Input** — immediately before invoking the capability, against the resolved `final_input`.
- **Output** — immediately after the capability returns, against its output.

Both threaded and inline executors enforce this. A failure produces a `STEP_ERROR` and fails the pipeline (no propagation to dependents). Static-input steps are effectively validated before any side effect occurs.

## 4. Validator

A minimal, dependency-free, deterministic structural validator (`core/runtime/schema.{hpp,cpp}`) supports the common JSON Schema subset: `type` (object/array/string/number/integer/boolean/null, or a list), `required`, `properties` (recursive), `items` (recursive), and `enum`. It returns the first error with a JSON-pointer-ish `path`, `expected`, and `actual`.

## 5. Structured error

On validation failure the step error is the structured object:

```json
{
  "error": "SCHEMA_VALIDATION_FAILED",
  "step": "B",
  "module": "string-tools",
  "capability": "slugify",
  "schema": "input",
  "details": { "path": "/meta/n", "expected": "integer", "actual": "string" }
}
```

This object is the `STEP_ERROR` trace context, and its compact `dump()` is the pipeline `error` string (so bindings can `JSON.parse` it).

## 6. Manifest exposure

`sdoa_engine_capabilities_json` includes `input_schema` / `output_schema` for any capability that declares them, alongside `module`, `capability`, `language`, `origin`, and `flags`. This is the "OpenAPI moment": once schemas are discoverable, pipeline validation, type/stub generation, and IDE autocompletion become straightforward downstream tooling.

## 7. Tested

`outputs/schema_test` (C ABI against `libsdoa`) verifies: foreign v3 input/output validation, missing-required, nested type mismatch (correct `/meta/n` path), output-schema violation, module-injected schema (`string-tools/slugify`), and manifest exposure. Existing native suites (core/stdlib/phase5x) and the Python/Node bindings all still pass.

## 8. Deferred (the compounding sequence beyond 5.B.1)

5.B.2 CLI + scaffolding · 5.B.3 Tier-2 bindings (Go/Ruby/PHP/Lua) · 5.B.4 Tier-3 bindings (C#/Swift/Java) · 5.B.5 module tooling (lint/package/publish/registry) · 5.B.6 dashboard/introspection UIs · 5.B.7 docs & examples. Plus still-open Phase 6.x (sandbox enforcement, signing, lifecycle, distributed execution). Schemas are the dependency these build on.
