# Validate pipelines before execution

Because every capability is schema-typed, you can catch errors statically — before running anything.

```bash
sdoa validate pipeline my-pipeline.json --modules ./modules
```

The validator builds the live manifest (stdlib + modules) and checks each pipeline for:

- **Unknown capabilities** — a step references `module::capability` not in the manifest.
- **Bad references** — an `@step.output` reference points at a step that doesn't exist.
- **Edge integrity** — edges reference declared steps.
- **Strict mode** — when the pipeline sets `"strict": true`, any `NONDETERMINISTIC` capability is rejected.
- **Static input schemas** — for steps whose input has no `@refs` to resolve, the input is validated against the capability's `input_schema`.

Example output for a bad pipeline:

```
INVALID: 2 error(s) in my-pipeline.json
  - P/A: input schema violation at /text (expected string, got integer)
  - P/B: reference '@nope.result' targets unknown step 'nope'
```

At runtime the engine enforces schemas too: input is validated just before a capability runs and output just after; a violation becomes a structured `STEP_ERROR`:

```json
{ "error": "SCHEMA_VALIDATION_FAILED", "step": "A", "module": "string-tools",
  "capability": "slugify", "schema": "input",
  "details": { "path": "/text", "expected": "string", "actual": "integer" } }
```

For fully reproducible runs, mark the pipeline `"strict": true` (nondeterministic capabilities are rejected at graph build) and run on the single-threaded inline executor. Use `sdoa dashboard` to visualize a pipeline's graph and per-step schemas, and `sdoa docs` to browse the full typed capability reference.
