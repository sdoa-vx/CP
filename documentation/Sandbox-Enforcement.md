# SDOA Sandbox Enforcement (Phase 6.1)

**Status:** Enforceable in-process core implemented and tested. True syscall confinement of foreign native code is explicitly out of scope (a later out-of-process + OS-sandbox phase).
**Date:** 2026-06-24

## The honest boundary

An in-process engine **cannot** sandbox arbitrary native module code. A hostile `.so` can always call `open()` / `socket()` / `time()` directly; there is no honest way to claim syscall confinement without OS-level isolation (separate process, seccomp, namespaces, containers). This phase therefore does **not** pretend to intercept syscalls. It enforces the layer the engine genuinely controls:

| Concern | What SDOA enforces today | What it does NOT do |
|---|---|---|
| Determinism | Pipeline-level gate: nondeterministic/network capabilities are rejected before execution unless explicitly permitted | — |
| Capability intent | Flags derived from module sandbox + capability metadata; surfaced in manifest, validator, dashboard, docs | — |
| Foreign modules | Conservative install/load policy (reject `unsafe`, gate `network`/`read-write` behind explicit opt-in) | Cannot stop a loaded native `.so` from making raw syscalls |
| Built-in I/O | stdlib `FileSystem` is confined to a configured root (engine abstraction, not raw FS) | Does not confine foreign modules' own FS access |

Built-in capabilities (stdlib + first-party modules) obey the sandbox contract strictly because **we** implement their I/O surface. Foreign native modules are **policy-gated, not syscall-sandboxed**. True confinement is a future "out-of-process + OS sandbox" phase.

## 1. Determinism gate (pipeline-level, enforced)

Pipelines are deterministic by default. A pipeline must opt in to nondeterminism:

```json
{ "id": "P", "allow_nondeterminism": true, "steps": [ ... ] }
```

At **graph build** (both threaded and inline executors), any step whose capability is flagged `nondeterministic` or `network` is rejected unless `allow_nondeterminism == true` **and** the pipeline is not `strict`:

```
NONDETERMINISM_NOT_ALLOWED: capability 'math-tools::factorial' is nondeterministic;
set allow_nondeterminism=true on the pipeline (and do not use strict)
```

`strict: true` is the strongest assertion (forbids nondeterminism even if `allow_nondeterminism` is set), preserving fully reproducible replay.

## 2. Capability flags & module intent

Capability flags: `pure`, `side_effecting`, `nondeterministic`, `network` (`CapFlags` / the `sdoa_cap_flags` ABI bitset). Modules declare coarse intent in `module.json`:

```json
"sandbox": { "fs": "none|read-only|read-write", "network": false, "clock": false, "random": false, "env": false }
```

At load time the engine **derives** flags from this intent — `clock`/`random` → `nondeterministic`, `network` → `network` — and ORs them onto the module's capabilities (`Engine::set_capability_flags`). The determinism gate, `sdoa validate pipeline`, the dashboard pipeline visualizer (orange = not-permitted nondeterministic/network), and `sdoa docs` all read these flags. The legacy array form (`{filesystem:[],network:[],env:[]}`) is still accepted.

## 3. Foreign-module install/load policy

Conservative, enforced where the engine has control (install/load — not syscalls):

- `unsafe: true` → **rejected** at install (`SANDBOX_UNSAFE_MODULE`) and refused at load (module recorded `loaded:false`).
- `network` (sandbox) → install refused unless `sdoa module install --allow-network`.
- `fs: "read-write"` → install refused unless `--allow-fs-write`.
- `clock`/`random` → permitted, but the module's capabilities become `nondeterministic`, so any pipeline using them needs `allow_nondeterminism`.

Built-in capabilities require no trust beyond `pure` + sandboxed FS; anything more from a third party needs an explicit operator opt-in.

## 4. Built-in I/O confinement

The stdlib `FileSystem` capabilities route every access through the engine's abstraction and are confined to a configured root (absolute paths and `..` escapes rejected — see `FileSystem` in the stdlib). This is a real guarantee for first-party code because the I/O goes through our wrapper, not raw syscalls.

## 5. Error codes

`SDOA_ERR_NONDETERMINISM_NOT_ALLOWED`, `SDOA_ERR_SANDBOX_UNSAFE_MODULE` (ABI), plus the structured `NONDETERMINISM_NOT_ALLOWED` run error and the validator's per-step messages.

## 6. What's deferred

Real per-capability resource confinement (FS/network/clock/RNG/env) for **foreign native modules** requires running modules **out of process** under an OS sandbox (seccomp/namespaces/containers) with the JSON boundary marshaled across the process edge. That is a separate isolation phase. Also deferred: module signing (Phase 6.4 — the `.sdoa` digest is the hook to verify trust before honoring elevated sandbox intent), lifecycle (remove/enable/pin), and distributed execution.
