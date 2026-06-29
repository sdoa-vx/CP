# SDOA Distributed Execution (Phase 6.6)

**Status:** Design spec + tested TCP PoC (`tools/isolation/`). Routing table, on-demand distribution, and TLS are staged.
**Date:** 2026-06-24

## Core idea

Any `<id>@<version>` module can run locally (a `modhost` process, seccomp-isolated) **or** remotely (a `modhost` on another machine), transparently. The engine is a **router**: capability invocation → routing decision → local or remote `modhost` → IPC → result. Distributed execution is literally *the same `modhost` and the same protocol, over TCP instead of stdio* — which the PoC proves.

## Proven (PoC)

`tools/isolation/modhost --listen <port>` serves the **identical length-prefixed JSON protocol** over a TCP socket; `tcp_driver.py` connected and invoked `math-tools` `factorial`/`fibonacci` **remotely** (3/3), with schema errors surfaced over the wire. The connection is `accept()`ed *before* seccomp, so the host can serve while the pure filter keeps the **module netless**. Only the transport changed (stdio → socket); everything else (seccomp, versioned loading, dispatch, failure semantics) is unchanged.

## Address model

Every version already has a unique address `id@version`. Distribution adds the digest:

```
id@version#<sha256-of-.sdoa>
```

e.g. `math-tools@1.0.0#787d7060b22b09f8fd13182f5895c88f547fa4d179710ddbdc52b0bdcd187437`. This is a **perfect remote identity, cache key, and reproducibility guarantee** — a host can say "I have `id@ver#digest`" or "send it to me," and the engine knows it's byte-for-byte the right module.

## Routing

The engine maintains `<id>@<version> → { local | host-A | host-B | ... }` and decides **per invocation**. Policies: `local-first` (default), `remote-first` (offload), `balanced` (round-robin/weighted), `pinned` (force a host), `digest-required` (run only on an exact digest match).

## Remote modhost & protocol

A remote `modhost` is the same binary on another machine, reachable via TCP, speaking the same `u32`-LE length + JSON frames. Messages: `hello` (handshake, ABI version), `ping`/`pong` (health), `invoke`/`result` (the proven core), and for distribution `load-module` (engine streams the `.sdoa`) / `module-loaded` (ack). Intentionally boring — boring is reliable.

## Module distribution

- **Preloaded** — remote already has `id@ver#digest` → engine just `invoke`s.
- **On-demand** — remote lacks it → engine sends `load-module` with the `.sdoa`; because the package is deterministic, digest-verified, and signed (6.4), this is safe; remote acks `module-loaded`, then `invoke`.

## Failure semantics

Adds `REMOTE_HOST_UNREACHABLE`, `REMOTE_HOST_TIMEOUT`, `REMOTE_MODULE_NOT_PRESENT`, `REMOTE_MODULE_DIGEST_MISMATCH`, `REMOTE_SANDBOX_VIOLATION`, `REMOTE_PROTOCOL_ERROR` — on top of the local `MODULE_PROCESS_CRASHED` / `MODULE_SANDBOX_VIOLATION` / `MODULE_IPC_PROTOCOL_ERROR`. The engine never crashes; it returns structured errors.

## Cluster, caching, security

- **Cluster** = engine + N remote `modhost`s. No consensus, no leader election, no distributed state — everything is stateless, deterministic, and digest-addressed (avoids Kubernetes/Nomad complexity).
- **Caching** — digest-addressed modules can be cached indefinitely on remotes; routing decisions cached on the engine; pure-capability *results* cacheable by `(digest, capability, input-hash)` (optional future phase).
- **Security** — inherits signing, trust, digest verification, sandboxing, versioned capabilities; adds **TLS** between engine and remotes, with optional mutual attestation later.

## Delivers

Remote execution, cluster execution, offloading, horizontal scaling, remote caching, multi-host pipelines, and reproducible distributed workflows.

## Honestly staged

Proven today: the transport-agnostic protocol over TCP with real out-of-process + seccomp execution. Remaining: the engine routing table + per-invocation policy, `hello`/`load-module` handshake messages, on-demand `.sdoa` streaming with digest+signature verification on receipt, TLS, and result caching. As with 6.5, the load-bearing mechanism runs today; the rest is wiring on top of the deterministic, digest-addressed, signed foundation.
