# SDOA Foreign Capability ABI & Hybrid Capability Model — v2

**Status:** Phase 5 (Tier-1 bindings). C ABI v2 implemented and tested.
**Date:** 2026-06-24

## 1. The Hybrid Model

SDOA capabilities come from two sources, with the engine staying sovereign in both cases:

- **Built-ins** — the standard library (String, Math, Json, FileSystem, System). Pure C++, registered at startup via `sdoa_engine_install_stdlib`. Fast, deterministic, sovereign.
- **Foreign capabilities** — host-language functions (Python, Node, Rust, …) registered through a controlled callback ABI. JSON-only across the boundary, explicit determinism flags, crash-isolated, and **registered per-engine** (no global mutable state — this is the SDOA sovereignty rule: "everything hangs off the Engine instance").

The scheduler, registry, and runtime remain pure C++. Foreign code is treated as an opaque sovereign module that communicates only through a declarative contract — exactly the SDOA principle "modules are sovereign; communication occurs only through declarative contracts."

## 2. C ABI v2 surface (additive over v1)

```c
/* Built-ins */
SDOA_Status sdoa_engine_install_stdlib(SDOA_EngineHandle, const char* fs_root);

/* Opaque JSON handle (backed by nlohmann::json) */
typedef struct sdoa_json sdoa_json;
sdoa_json* sdoa_json_parse(const char* utf8, const char** err_msg);
char*      sdoa_json_stringify(const sdoa_json*);   /* malloc'd; free with sdoa_string_free */
void       sdoa_json_free(sdoa_json*);
void       sdoa_string_free(char*);

/* Foreign capability registration */
typedef sdoa_json* (*sdoa_foreign_fn)(const sdoa_json* input, void* user_data);
typedef enum { SDOA_CAP_PURE=1, SDOA_CAP_SIDE_EFFECTING=2, SDOA_CAP_NONDETERMINISTIC=4 } sdoa_cap_flags;
typedef struct { const char* module; const char* capability; sdoa_foreign_fn fn; void* user_data; uint32_t flags; } sdoa_cap_desc;
SDOA_Status sdoa_engine_register_foreign_capability(SDOA_EngineHandle, const sdoa_cap_desc*);

/* Introspection */
SDOA_Status sdoa_engine_capabilities_json(SDOA_EngineHandle, char* buf, size_t n, size_t* required);

/* Config flag */
#define SDOA_FLAG_INLINE 1u  /* run pipelines on the calling thread */
```

## 3. Memory ownership (the JSON boundary)

The boundary is JSON-only — no raw pointers or shared ownership of engine memory cross it.

- The engine passes the foreign fn a **borrowed** `const sdoa_json* input` (engine owns it).
- The foreign fn reads it with `sdoa_json_stringify` (then frees that string with `sdoa_string_free`).
- The foreign fn returns a **new** `sdoa_json*` built via `sdoa_json_parse`. **The engine takes ownership and frees it.**
- Returning `NULL` signals host-side failure → surfaces as a `STEP_ERROR`.
- To carry an error message, return a handle whose JSON is `{"__sdoa_error__": "message"}`; the engine raises that message as the step error.

## 4. Crash isolation

Foreign exceptions must never unwind into C++. Each binding's trampoline catches host exceptions/panics and converts them to a structured error (`{"__sdoa_error__": ...}` or `NULL`). The engine wrapper turns that into a normal `STEP_ERROR`, so a misbehaving capability fails its step without corrupting the runtime. Verified in all three bindings' tests (Python `raise`, Node `throw`, Rust `panic!` → caught).

## 5. SDOA compliance validation (enforced at registration)

`sdoa_engine_register_foreign_capability` rejects (returns `SDOA_ERR_NONCOMPLIANT`) any descriptor that violates:

1. **Identity** — `module` and `capability` must be non-empty; `fn` non-null.
2. **Flag consistency** — `PURE` is exclusive (cannot combine with `SIDE_EFFECTING`/`NONDETERMINISTIC`); at least one flag must be set (determinism must be declared honestly).
3. **No collision** — `module` may not be a built-in (`String`, `Math`, `Json`, `FileSystem`, `System`). Built-ins stay sovereign.

All three rules are covered by the C smoke test and each binding's test suite.

## 6. Capability metadata & manifest

Every registered capability carries `CapabilityMeta { flags, language, origin }`. `sdoa_engine_capabilities_json` returns a sorted manifest:

```json
{ "module": "Py", "capability": "score", "language": "foreign", "origin": "foreign",
  "flags": { "pure": true, "side_effecting": false, "nondeterministic": false } }
```

Built-ins report `origin: "builtin"`, `language: "cpp"`. This is the contract the dashboard and `System::capabilities` use for discovery and for surfacing determinism characteristics.

## 7. Single-threaded hosts & inline execution

The threaded scheduler runs capabilities on **worker threads**. That is fine for C++ built-ins and for Python (CPython's ctypes callback acquires the GIL on the worker thread), but it deadlocks single-threaded runtimes like Node: koffi cannot synchronously call a JS function from a foreign thread while the event loop is blocked in `run_pipeline`.

The fix is **inline execution** (`SDOA_FLAG_INLINE`): the engine runs the DAG deterministically on the calling thread, so a foreign callback runs on a thread the host controls. The Node binding sets this flag automatically; the Rust binding exposes it (`Engine::new(threads, inline)`) and recommends `inline = true` when registering Rust capabilities. Inline execution produces identical outputs and trace to the threaded path.

## 8. Sandbox alignment

Foreign capabilities get **no raw host access** through the ABI. They receive JSON and return JSON. Filesystem/network access is only available by composing sandboxed built-in capabilities (e.g. `FileSystem::read_text`, confined to a configured root). The ABI exposes no process, signal, or arbitrary-path APIs.

## 9. Designed but deferred (next: Phase 5.x)

These were specified and are intentionally **not yet wired**, to avoid destabilizing the freshly hardened scheduler this session. They are additive and non-breaking:

1. **Flag-based scheduling** — `Scheduler::can_parallelize(meta)` returning `false` for `SIDE_EFFECTING`/`NONDETERMINISTIC` capabilities (serialize side-effecting steps; never reorder; never cache), and an optional "strict deterministic" engine mode that refuses nondeterministic capabilities. The metadata needed (flags per capability) is already stored in the registry today; only the scheduler consult-and-enforce step remains.
2. **Trace metadata enrichment** — adding a `capability` block (`module`, `language`, `origin`, `flags`) to `STEP_START`/`STEP_ERROR` trace events so the dashboard can show which language ran and whether it was pure/side-effecting/nondeterministic. The registry already exposes per-capability metadata; this is an `emit_trace` enhancement plus a protocol-doc note.
3. **`language` tagging** — the C `sdoa_cap_desc` currently records `language: "foreign"`; bindings can pass a concrete tag (`python`/`node`/`rust`) in a future additive field.

Tracked under the Phase 5.x follow-up in `get to work.txt`.
