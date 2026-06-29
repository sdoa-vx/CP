# SDOA Multi-Version Coexistence (Phase 6.3)

**Status:** Implemented and tested.
**Date:** 2026-06-24

A module ID may have multiple installed versions, and the engine loads every *active* version simultaneously. Pipelines reference a specific version (`id@version`) for reproducibility, or the plain `id` which resolves to the highest active version.

## On-disk layout

```
<engine>/modules/
  index.json
  <id>/<version>/{ module.json, lib/<entry>, capabilities/*.json, .sdoa-meta.json }
```

Each version installs into its own `<id>/<version>/` directory (legacy flat `<id>/module.json` is still loaded for back-compat).

## index.json (nested by version)

```json
{ "modules": {
  "math-tools": { "versions": {
    "1.0.0": { "state": "active",   "pinned": false, "signed": true, "trusted": true, "key_id": "org.example" },
    "1.1.0": { "state": "active",   "pinned": false, "signed": true, "trusted": true, "key_id": "org.example" }
  } } } }
```

State, pinning, and trust are **per version**.

## Engine loading

`sdoa_engine_load_modules` discovers `<id>/<version>/` dirs and, for each version marked `active` in `index.json` (default active if absent), loads it under a **versioned capability namespace**: the engine's `set_load_namespace("id@version")` makes the module's registrations land under `id@version::capability` regardless of what the `.so` declares. After loading a module's versions, the **highest active version is aliased to the plain `id`** (`alias_module`), so:

```
math-tools@1.0.0::factorial    # version-addressed (reproducible)
math-tools@1.1.0::factorial
math-tools::factorial          # plain id -> highest active version (1.1.0)
```

Disabling the highest version re-points the plain alias to the next-highest active version; disabling all hides the module entirely. This is deterministic and collision-free (verified: 2 active versions → versioned + alias names present; disable 1.1.0 → `@1.1.0` gone, alias falls to 1.0.0).

## CLI

All lifecycle verbs accept `<id>` (all versions) or `<id>@<version>` (one):

```bash
sdoa module install <file.sdoa|id@version>     # installs alongside existing versions
sdoa module list                               # module id, then an indented row per version (state/pinned/trust)
sdoa module disable <id>@<version>             # or <id> for all versions
sdoa module enable  <id>@<version>
sdoa module pin     <id>@<version>             # pin an exact version
sdoa module unpin   <id>
sdoa module remove  <id>@<version>             # or <id> to remove all versions
sdoa module update  [<id>]                     # installs registry's latest ALONGSIDE; skips if any version pinned
```

`update` now adds the newer version and **leaves older ones intact** (rollback = `disable` new / `enable` old).

## Why it matters

- **Reproducibility** — pin an exact capability version (`string-tools@1.0.3::trim`).
- **Safe upgrades / rollback** — install new, test, enable, disable old, or instantly revert.
- **Distributed execution** — digest-addressed modules + versioned capability names = perfect cache keys (Phase 6.6).
- **Future isolation** — different versions can run in different processes (the out-of-process phase).

## Tested

`tests/cli_test.sh` (multi-version block): side-by-side install of 1.0.0 + 1.1.0, both version dirs on disk, nested index, versioned names + plain alias in the manifest, disable-highest → alias fallback, per-version remove leaving the other. Full standalone scenario 12/12. Regression: native core/stdlib/phase5x + Python (binding + modules) + Node all pass; cli_test 62/62.

## Deferred

Implicit semver range resolution (`^1.0`), per-pipeline default-version policy beyond "highest active", key rotation/revocation, and the out-of-process isolation phase.
