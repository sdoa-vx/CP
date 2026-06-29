# SDOA Module Signing & Trust (Phase 6.4)

**Status:** Implemented and tested. Real ed25519 via libsodium (CLI-only). The engine library stays crypto-free.
**Date:** 2026-06-24

## What is signed

The signature covers the package **digest**, not the whole blob:

```
digest = SHA256(canonicalized { sdoa_version, module, files })
```

Signing the digest keeps signatures stable across cosmetic repackaging and avoids re-signing on byte-level churn. The signature is added **after** the digest and is **not** part of it.

## Signature block (`.sdoa`)

```json
"signature": {
  "algorithm": "ed25519",
  "key_id": "org.example.release",
  "value": "<base64 ed25519 signature of the digest hex>"
}
```

## Architecture (clean dependency boundary)

- The **engine** (`libsdoa`) does **not** link libsodium and needs no crypto primitives — it stays portable and sovereign.
- The **CLI** is a developer tool and is the only component that links libsodium (`-l:libsodium.so.23`, using the stable `crypto_sign_ed25519_*` symbols — no headers required). Signing is **optional**, exactly like GPG in Git, signing in Cargo/NPM, or Docker image signing.
- Verification at install is performed by the CLI before unpacking. Modules execute through the engine, which never needs libsodium.

If libsodium is absent, everything except `key generate` / `module sign` / signed-install verification still works; those commands fail gracefully.

## Trust model

Trusted public keys live in `~/.sdoa/trust/keys/<key_id>.pub` (override with `--trust <dir>`).

1. **Unsigned modules** — installable only if they request **no elevated intent** (pure + built-in sandboxed FS).
2. **Signed + trusted** — signature verifies against a trusted key → elevated intents are honored (`network`, `fs: read-write`, `clock`, `random`, `unsafe`).
3. **Invalid signature** — install refused: `SIGNATURE_INVALID`.
4. **Unknown/untrusted key** — install refused: `SIGNATURE_UNTRUSTED_KEY` (override with `--allow-unsigned`).
5. **Unsigned + elevated** — install refused: `SIGNATURE_REQUIRED_FOR_ELEVATED_INTENT` (or `SANDBOX_UNSAFE_MODULE` for `unsafe`), unless a per-intent operator override is given (`--allow-network`, `--allow-fs-write`, `--allow-unsigned`).

This mirrors container registries, package managers, firmware, and WASM module signing.

## CLI

```bash
sdoa key generate <key_id> [-o <key.key>]        # ed25519 keypair (key.key holds secret+public)
sdoa key trust <key.key|.pub> [--trust <dir>]    # install the public key into the trust store
sdoa module sign <file.sdoa> --key <key.key> [-o <out>]   # add signature block over the digest
sdoa module install <file.sdoa> [--trust <dir>] [--allow-unsigned] [--allow-network] [--allow-fs-write]
```

Install records a `.sdoa-meta.json` trust marker (`signed`, `key_id`, `trusted`, `signature` status) in the installed module directory for dashboard display.

## Honest boundary

Signing establishes **provenance and integrity** — who built a module and that it wasn't tampered with — and gates *elevated intent* on trust. It is **not** syscall sandboxing: a trusted-but-malicious native module can still misbehave at the OS level. True confinement of foreign native code remains the deferred out-of-process + OS-sandbox phase. Signing + the conservative install policy + the deterministic digest are the trust layer that makes that future isolation meaningful.

## Tested

`tests/cli_test.sh` (signing block): keygen, pack, unsigned-elevated refusal, sign, trust, signed+trusted elevated install honored (no `--allow-network` needed), untrusted-key rejection (`SIGNATURE_UNTRUSTED_KEY`), tampered-signature rejection (`SIGNATURE_INVALID`). ed25519 round-trip / tamper / wrong-key behavior verified against libsodium directly.
