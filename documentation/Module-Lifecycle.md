# SDOA Module Lifecycle (Phase 6.2)

**Status:** Implemented and tested.
**Date:** 2026-06-24

First-class lifecycle for installed modules: what's installed, what's active, what's pinned, and what's actually exposed to the engine right now.

## State model

Each engine keeps a lifecycle index at `<engine>/modules/index.json`:

```json
{
  "modules": {
    "string-tools": {
      "version": "1.0.0",
      "state": "active",        // active | disabled
      "pinned": false,          // pinned versions are not auto-upgraded by a future `update`
      "signed": true,           // from install-time signature verification
      "trusted": true,
      "key_id": "org.example"
    }
  }
}
```

- **installed**: present on disk under `<engine>/modules/<id>/`.
- **active vs disabled**: only `active` modules are loaded; `disabled` modules stay on disk but are skipped by the loader.
- **pinned vs floating**: `pinned` marks a version as not-to-be-auto-upgraded (honored by a future `update` command).
- **trust/signing**: carried over from the install policy (Phase 6.4).

The index is the single source of truth, written by the CLI and read by the engine loader, `sdoa module list`, and the dashboard.

## Engine behavior

`sdoa_engine_load_modules(search_path)` reads `<search_path>/index.json`, builds the set of `disabled` module ids, and **skips** them during discovery — they are never `dlopen`ed and never register capabilities. Disabled modules therefore disappear from the manifest entirely (verified: 32 capabilities active → 30 when string-tools is disabled → 32 again on enable). Modules with no index entry are treated as active (back-filled on first lifecycle op), so manually-placed modules still load.

## CLI

```bash
sdoa module list [--engine <dir>]                 # MODULE / VERSION / STATE / PINNED / TRUST table
sdoa module remove  <id>[@version] [--engine <dir>]   # delete from disk + index
sdoa module disable <id> [--engine <dir>]
sdoa module enable  <id> [--engine <dir>]
sdoa module pin     <id>[@version] [--engine <dir>]
sdoa module unpin   <id> [--engine <dir>]
sdoa module update  [<id>] [--engine <dir>] [--registry <dir>]   # upgrade from registry; honors pinned
```

`update` (with an id, or bulk over all installed modules) compares the installed version against the registry's latest (dotted-numeric compare), and for **floating** (non-pinned) modules pulls and re-installs the newer artifact — re-running the full install policy (signature/trust) and preserving a `disabled` state across the upgrade. **Pinned** modules are skipped (`pinned, skipping`). This is the version-management half of lifecycle.

`sdoa module install` writes/updates the index entry (`state: active`, `pinned: false`, plus signing/trust info). Example `list` output:

```
MODULE             VERSION   STATE     PINNED   TRUST
string-tools       1.0.0     disabled  no       unsigned
```

## Dashboard

The Module Browser's `modules.json` now carries `state`, `pinned`, `signed`, and `trusted` (merged from the index), alongside capabilities and sandbox intent — so the operator sees active/disabled, pinned/unpinned, and trust at a glance.

## Tested

`tests/cli_test.sh` (lifecycle block): install → `list` active → caps in manifest; `disable` → caps hidden from manifest + `list` shows disabled + files remain on disk; `enable` → caps return; `pin`/`unpin` recorded in the index; `remove` → directory and index entry gone.

## Deferred

Multi-version coexistence per id (install several versions side by side), key rotation/revocation, and the out-of-process isolation phase.
