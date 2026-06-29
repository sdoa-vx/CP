# SDOA Out-of-Process + OS Sandbox Isolation (Phase 6.5)

**Status:** Design spec + tested Linux PoCs (`tools/isolation/`). Engine-path integration and non-Linux backends are staged.
**Date:** 2026-06-24

## Why

Today's sandbox is honest policy, not confinement: a *trusted* native module can still open files, spawn processes, make syscalls, or crash the engine. Isolation runs each module version in its **own OS process** under an **OS sandbox**, turning SDOA into a secure capability runtime. Everything else (install, signing, trust, versioned capabilities, lifecycle, dashboard, bindings) is unchanged — isolation is an *execution* detail.

## Proven on this platform (PoCs)

- **Real seccomp confinement, no root** — `tools/isolation/seccomp_poc`: under `PR_SET_NO_NEW_PRIVS` + a BPF filter, `write()` is allowed and `openat()`/`socket()` are killed with `SIGSYS` (exit 159). Dependency-free (raw `prctl` + BPF; `libseccomp` not required, though `libseccomp.so.2` is present).
- **Out-of-process capability invocation** — `tools/isolation/modhost` (links `libsdoa`, runs ONE module under seccomp, serves length-prefixed JSON over stdio) + `ipc_driver.py` (engine stub). Verified 5/5: `math-tools` `factorial`/`fibonacci`/`gcd` computed **in a separate sandboxed process**, schema violations surfaced over IPC, and a killed host detected as a crash.

## 1. Process model

One process per `<id>@<version>` (composes with the multi-version namespace from 6.3). Lazy-spawned on first capability use, supervised by the engine, reused across calls. State machine:

```
            spawn            ready
  (none) ──────────▶ starting ──────▶ running ──┐
                         │                │      │ idle TTL / shutdown
                         │ spawn/handshake fail  ▼
                         └──────────▶ failed   stopped
   running ── crash/timeout/SIGSYS ──▶ failed (respawn on next use, with backoff)
```

## 2. IPC protocol

Length-prefixed JSON frames (`u32` little-endian length, then UTF-8 JSON), no shared memory, deterministic request/response:

```json
// engine → host
{ "type": "invoke", "id": "req-123", "cap": "math-tools@1.1.0.factorial", "input": { "n": 5 } }
// host → engine
{ "type": "result", "id": "req-123", "ok": true,  "value": { "result": 120 } }
{ "type": "result", "id": "req-123", "ok": false, "error": { "code": "SCHEMA_VALIDATION_FAILED", "details": {...} } }
```

Plus `{"type":"hello","abi":1,...}` handshake and `{"type":"ping"}`/`pong` for liveness. (The PoC uses the simplified `{module,capability,input}` → `{ok,output|error}` subset.)

## 3. Sandbox policy → OS backend mapping

Capability intents become syscall filters. Default-deny allow-list is the production target; the PoC uses a default-allow deny-list to prove the mechanism.

| Intent (false ⇒ denied) | Linux seccomp denies | macOS seatbelt | Windows |
|---|---|---|---|
| `network` | `socket`, `connect`, `accept`, `bind`, `sendto` | deny `network*` | AppContainer no-net |
| `fs:read-write` | `openat`(write modes), `unlink`, `rename`, `mkdir` | deny `file-write*` | Job Object / restricted token |
| `clock` | `clock_gettime`, `gettimeofday` | — | — |
| `random` | `getrandom`, open `/dev/urandom` | — | — |
| `unsafe: true` | **no filter** (trusted, signed-only) | none | none |

Backends are an abstraction: **Linux = seccomp (implemented & proven)**; namespaces + cgroups (resource limits) need privileges and are staged; macOS `sandbox-exec`/seatbelt and Windows Job Objects/AppContainer are specified, implemented later. (fs confinement also leans on the existing root-confined stdlib `FileSystem`, invoked via IPC rather than raw module syscalls.)

## 4. Engine integration (staged)

The engine becomes a **router**: resolve capability → `<id>@<version>` → ensure that version's process exists (spawn if needed) → send `invoke` → await `result` → propagate. The in-process path (today's default) and the out-of-process path coexist behind a per-module execution mode; the registry's versioned namespace (6.3) is the routing key. This is the one invasive change and is deliberately deferred until the protocol + backends are hardened, to avoid destabilizing the in-process engine.

## 5. Failure semantics

| Condition | Detection | Surfaced error |
|---|---|---|
| Process crash | IPC EOF / broken pipe / `waitpid` signal | `MODULE_PROCESS_CRASHED` |
| Timeout | no `result` within deadline | `MODULE_PROCESS_TIMEOUT` (host killed) |
| Sandbox violation | child killed by `SIGSYS` | `MODULE_SANDBOX_VIOLATION` |
| Bad/garbled frame | length/JSON decode fails | `MODULE_IPC_PROTOCOL_ERROR` |
| Signature/version mismatch | pre-spawn check | `SIGNATURE_INVALID` / version error |

A failed version is marked `failed` and respawned (with backoff) on next use; failures never crash the engine.

## Honest boundary

The PoCs prove the two load-bearing claims (real non-root syscall confinement; out-of-process capability invocation with crash/violation detection). What remains for the full phase: default-deny allow-lists per intent, namespaces/cgroups resource limits, the macOS/Windows backends, and routing the engine's execution path through the process table. None of that is fantasy — the hard parts run today under `tools/isolation/`.
