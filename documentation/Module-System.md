# SDOA Module System (Phase 6) — Discovery & Loading

**Status:** Phase 6 core implemented and tested. Signing, enforcement, full lifecycle, and distributed execution deferred.
**Date:** 2026-06-24

A **module** is a self-describing, on-disk package of capabilities backed by a shared library. The engine discovers modules under a search path, `dlopen`s each one, and lets it register its capabilities through the same per-engine foreign-capability ABI. MCP is therefore "structured discovery + loading + sandbox context" layered on top of the capability ABI — the runtime stays sovereign.

## 1. Layout on disk

```
modules/
  string-tools/
    module.json
    lib/
      libstring_tools.so      # or .dll / .dylib
    capabilities/             # optional per-capability detail (schemas, docs)
      upper.json
      slugify.json
```

### module.json (minimal)

```json
{
  "id": "string-tools",
  "version": "1.0.0",
  "language": "cpp",
  "entry": "lib/libstring_tools.so",
  "capabilities": ["upper", "slugify"],
  "sandbox": { "filesystem": ["./data"], "network": [], "env": [] }
}
```

`capabilities/*.json` are optional and not required for loading; they hold schemas/descriptions for introspection and (future) validation.

## 2. Discovery

```c
SDOA_Status sdoa_engine_load_modules(SDOA_EngineHandle engine, const char* search_path);
```

Algorithm: for each immediate subdirectory `d` of `search_path`, if `d/module.json` exists, treat `d` as a module root and load it. Directories are processed in sorted (deterministic) order. No recursion (can be added later). Bindings expose this directly (Python: `engine.load_modules(path)`).

## 3. The module ABI

Every module's shared library MUST export this well-known symbol:

```c
SDOA_Status sdoa_module_register(SDOA_EngineHandle engine, const sdoa_module_env* env);
```

It registers the module's capabilities — typically by calling `sdoa_engine_register_foreign_capability` once per capability — and returns `SDOA_OK`. Because the entrypoint receives the **C `SDOA_EngineHandle`**, modules are language-agnostic: they are built against `sdoa.h` only and never see the internal C++ engine.

A module's library is built against the C ABI and leaves the `sdoa_*` symbols **undefined**; they resolve from the host's already-loaded `libsdoa` at `dlopen` time (see §6). Do not statically link `libsdoa` into a module.

## 4. Loader algorithm

`sdoa_engine_load_modules` performs, per module directory:

1. Parse `module.json` (`id`, `version`, `language`, `entry`, `capabilities`, `sandbox`).
2. Resolve `entry` relative to the module directory.
3. `dlopen` the library (`RTLD_NOW | RTLD_LOCAL` on POSIX; `LoadLibrary` on Windows).
4. `dlsym("sdoa_module_register")`.
5. Build the `sdoa_module_env` sandbox-intent struct from `module.json`'s `sandbox`.
6. Call `sdoa_module_register(engine, &env)`.
7. Record module metadata (id/version/language/path/capabilities/sandbox, plus `loaded`/`error`) on the engine. The `dlopen` handle is retained and `dlclose`d when the engine is destroyed (after the engine itself is torn down, so no capability is ever called into unloaded code).

Per-module failures are isolated: a bad module is recorded with `loaded:false` and an `error`, and loading continues for the rest.

Introspection:

```c
SDOA_Status sdoa_engine_modules_json(SDOA_EngineHandle, char* buf, size_t n, size_t* required);
```

returns `[{id,version,language,path,capabilities,sandbox,loaded,error}, ...]`.

## 5. Sandbox context (intent, not yet enforced)

The loader passes the module's declared sandbox to its register entrypoint:

```c
typedef struct {
    const char** fs_allow;   /* NULL-terminated allowed path prefixes */
    const char** net_allow;  /* NULL-terminated allowed hosts */
    const char** env_allow;  /* NULL-terminated allowed env vars */
} sdoa_module_env;
```

In Phase 6 this is **intent**: modules are expected to honor it, and the contract exists end-to-end (manifest → loader → module). Engine-side enforcement (confining filesystem/network/env, resource limits) is Phase 6.x. The arrays are valid only for the duration of the `sdoa_module_register` call; a module must copy anything it retains.

## 6. Symbol resolution requirement

Because a module leaves `sdoa_*` undefined and resolves them from the host `libsdoa` at `dlopen`, the host must expose `libsdoa`'s symbols in the global dynamic scope:

- **C/C++ host** linking `libsdoa` as a shared library: works by default (a NEEDED library participates in global symbol resolution).
- **Python**: the binding loads `libsdoa` with `RTLD_GLOBAL` (handled automatically).
- **Other FFI hosts** (e.g. Node/koffi): load `libsdoa` with global symbol visibility, or preload it, before calling `load_modules`.

## 7. Building a module (example)

```bash
g++ -std=c++20 -fPIC -shared -I <repo>/abi/include -I <repo>/third_party \
    modules/string-tools/src/string_tools.cpp \
    -o modules/string-tools/lib/libstring_tools.so
# (no -lsdoa; sdoa_* resolve from the host at load time)
```

A complete, working example lives at `core/modules/string-tools/` (capabilities `upper`, `slugify`). It is exercised by `outputs/modules_test` (C++) and `bindings/python/tests/test_modules.py`.

## 8. Deferred (Phase 6.x)

- **6.3 enforcement** — actually confine filesystem/network/env and apply resource limits (currently intent only).
- **6.4 signing** — sign module manifests; verify signatures at load; reject tampering.
- **6.5 lifecycle** — install / update / remove / enable-disable / version pinning.
- **6.6 distributed execution** — remote capability execution, remote discovery, remote sandbox enforcement.
- Capability **schema validation** (5.4) using the `capabilities/*.json` schemas, at pipeline build and step execution.
