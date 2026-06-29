# SDOA Built-In Capability Standard Library — Roadmap

**Status:** Phase 4.1 shipped; 4.2 designed; 4.3→4.9 planned
**Date:** 2026-06-24

The standard library is a set of **pure, deterministic, JSON-native, parallel-safe** capabilities registered onto an `Engine` via its public `register_capability` API. The engine core has zero compile-time dependency on the stdlib — capabilities are a layer *above* the engine, so the runtime stays sovereign.

## Design invariants (apply to every capability)

1. **Pure / deterministic** — output is a function of input only. No hidden state, no system clock, no RNG, no network. (Time and any nondeterministic source arrive only with explicit injection — Phase 4.7.)
2. **Side-effect-controlled** — the only I/O in 4.1 is *read-only*, *sandboxed* filesystem access confined to a configured root. Writes are gated behind Phase 4.5 under strict rules.
3. **JSON-native** — every capability takes a JSON object of named params and returns a JSON object whose primary value is the `result` field, so downstream steps reference `@step.result`. (Identity-style caps like `System::echo` return their input verbatim.)
4. **Parallel-safe** — capabilities are reentrant and hold no shared mutable state, so the scheduler can run them concurrently.

## Registration

```cpp
#include "core/capabilities/capabilities.hpp"
sdoa::caps::register_capabilities(engine, { .fs_root = "/path/to/sandbox" });
// or per-category: register_string(engine), register_math(engine), ...
```

`System::capabilities` reflects the live registry (`Engine::list_capabilities()`), so the dashboard can discover what an engine instance supports at runtime.

---

## Phase 4.1 — SHIPPED (30 capabilities)

| Module | Capabilities |
|--------|-------------|
| `String` | `concat`, `split`, `replace`, `trim`, `to_upper`, `to_lower`, `format` |
| `Math` | `add`, `subtract`, `multiply`, `divide`, `round`, `clamp`, `sum`, `avg` |
| `Json` | `get`, `set`, `remove`, `merge`, `flatten`, `unflatten`, `filter`, `map` |
| `FileSystem` (read-only, sandboxed) | `read_text`, `read_json`, `list_dir`, `stat` |
| `System` (meta/introspection) | `echo`, `version`, `capabilities` |

Tested by `tests/test_stdlib.cpp`: every capability, multi-step `@step.result` resolution chains, sandbox traversal rejection, and 100× determinism.

Conventions: `Json` paths are dot-delimited with integer segments indexing arrays (`arr.0.name`). `Json::merge` reuses the engine's `deep_merge` so semantics match the pipeline output-propagation layer exactly. `FileSystem` rejects absolute paths and any `..` escape above the sandbox root.

---

## Planned Phases (the full long list)

### Phase 4.3 — Collections / Arrays
`Array::map`, `filter`, `reduce`, `sort`, `unique`, `slice`, `concat`.
(`Json::filter`/`map` already cover the common object-array cases; `Array::*` generalizes to arbitrary element transforms and adds `reduce`/`sort`/`unique`/`slice`.)

### Phase 4.4 — Extended String + Math + JSON
- `String`: `regex_match`, `regex_replace`, `substring`, `starts_with`, `ends_with`, `contains`.
- `Math`: `mod`, `min`, `max`, `floor`, `ceil`, `normalize`.
- `Json`: `reduce`, `sort`, `group_by`, `project` (field subset), `validate_schema`.

### Phase 4.5 — FileSystem Writes (gated)
`write_text`, `write_json`, `write_bytes`, `mkdir`, `copy`, `move`, `delete`, plus `read_bytes`.
Writes are **non-deterministic side effects** — they require an explicit writable-root grant, are excluded from the determinism contract, and emit audit trace events. Read stays the default.

### Phase 4.6 — Crypto / Hashing (pure)
`Crypto::sha256`, `hmac_sha256`, `md5` (optional), `base64_encode/decode`, `hex_encode/decode`.
Pure and stateless — used for IDs, dedup, integrity, signatures.

### Phase 4.7 — Date & Time (injected clock)
`Time::parse`, `format`, `add`, `subtract`, `diff`.
Deterministic by design: **no `now()`**. Any "current time" must be injected into the pipeline input explicitly, preserving reproducibility.

### Phase 4.8 — Validation
`Validate::is_number`, `is_string`, `is_array`, `is_object`, `json_schema`, `matches_regex`.
Lets pipelines enforce invariants before proceeding (fail-fast via `STEP_ERROR`).

### Phase 4.9 — Control / Flow Utilities (pure, non-branching)
`Util::coalesce` (first non-null), `default` (fallback), `switch` (pure mapping table), `case_map` (value → value).
Enables conditional *shaping* without nondeterministic control flow — SDOA avoids data-dependent branching in the DAG itself.

### Meta (ongoing)
`System::echo`, `version`, `capabilities` shipped in 4.1; `System::debug` (structured debug output) to follow.

---

## Target source layout (Phase 5+)

Capabilities are organized one folder per category under `core/capabilities/`. In 4.1 each category is a single translation unit (`core/capabilities/<category>/<category>.cpp`) for build performance; as categories grow, individual capabilities can be split into per-file sovereigns (`core/capabilities/string/concat.cpp`, …) without changing the registration API.

```
core/
  capabilities/
    capabilities.hpp / .cpp     # config + aggregator (register_capabilities)
    string/  math/  json/  filesystem/  system/      # SHIPPED (4.1)
    array/  time/  crypto/  validate/  util/          # PLANNED (4.3-4.9)
    CMakeLists.txt
```

The broader platform tree (Phase 5+) adds sibling top-level trees that consume the C ABI:

```
bindings/   rust/  node/  python/  go/  (then C#/.NET, Java/Kotlin; later Swift, Zig, WASM)
dashboard/  web/  vscode/
tools/      sdoa-validate-model, sdoa-validate-pipeline, sdoa-run
```

These are out of scope for Phase 4.x and tracked under Phase 5 (Multi-Language Bindings) and Phase 6 (MCP Integration).
