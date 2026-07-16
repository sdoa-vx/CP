# C:\MCP Repo Hygiene & SDOA Governance Audit

Date: 2026-07-13
Scope: C:\MCP (the connected project folder). First-party hand-written source lives in two places — `portfolio\` (follows the canonical `ui/substrate/evolution/authorities` layout) and `server\` (a flat Node/TS backend that does not). Vendor/build trees (`extract_vsix\`, `wix314\`, `git-filter-repo-2.47.0\`, `node_modules\`, `portfolio\evolution\legacy\antigravity-sdk-python\`) were identified but excluded from the governance checks below — they're third-party or generated, not code you wrote.

---

## Part 1 — Files that should be moved out of the repo

| Category | Path(s) | Why | Recommendation |
|---|---|---|---|
| Vendored toolchain | `wix314\` (~220 files) | Full WiX Toolset v3.14 binary install, not source | Delete/untrack; document as a build prerequisite |
| Vendored toolchain | `git-filter-repo-2.47.0\` | Full copy of the `git-filter-repo` CLI | Delete/untrack; reference as external dep |
| Vendored SDK | `portfolio\evolution\legacy\antigravity-sdk-python\` | Full checkout of Google's Antigravity Python SDK, own CI/license/tests | Move outside the repo or install via package manager |
| Build output | `dist\` | Legitimate `tsc` output of `server\src`, **but** `dist\server\evolution\experimental\*Innovation.service.js` (~60 oddly-named files) looks like scratch output from a self-modifying generator | Prune the `experimental` subfolder; regenerate `dist/` on build, don't hand-maintain |
| Build output | `build_staging\` (~90 files) | Scratch dir with throwaway files (`bob.ts`, `testapp.ts`, `tewstapp.ts`) and generator output | Delete |
| Build output | `extract_vsix\` (5,373 files) | Fully unpacked + built `.vsix`, including its own `node_modules`, `dist`, and a native CMake build tree | Delete entirely, rebuild from source when needed |
| Native build artifacts | `core\build\`, `core\cli\build\` | CMakeCache.txt, `.obj`, test `.exe` — out-of-tree build output | Delete |
| Release binaries | `release-binaries\` (24 files: `.exe`/`.msi`/`.wixpdb`) | Compiled release artifacts | Already gitignored — keep it that way, ship via GitHub Releases instead |
| Dependency output | `node_modules\` (4 separate installs: root, `extract_vsix\extension\`, `tracksdoa-v2\`, `mcp-worker\`) | Package manager output | Confirm none were committed before `.gitignore` existed |
| **Secrets** | `keys\sdoa-autopr.2026-06-21.private-key.pem` | Private key (likely a GitHub App key) sitting in-tree | Move outside the repo; if it was ever committed, rotate it |
| **Secrets** | `.env`, `extract_vsix\extension\.env`, `tracksdoa-v2\.env` | Real env files (should only ever track `.env.example`) | Same — verify never committed, rotate any keys that were |
| Logs | `rescue.log`, `.sdoa-logs.jsonl`, `mesh_logs\*.log` (13 files) | Runtime logs | Already gitignored |
| Duplicate assets | Root-level `SDOA.seal.svg` / `SDOA.seal.outline.svg`, plus everything under `extract_vsix\` | Per-package copies inside `extension\` and `server\public\legacy_v2\` are legitimate; the loose root copies and the `extract_vsix` copies look like packaging leftovers | Delete the loose/duplicate copies |

**`.gitignore` gap:** a `.gitignore` exists at `C:\MCP\.gitignore` and is otherwise well-built (covers `node_modules/`, `dist/`, `*.env*`, `*.pem`/`*.key`, `release-binaries/`, logs, OS cruft) — but it does **not** cover `wix314/`, `git-filter-repo-2.47.0/`, `build_staging/`, `extract_vsix/`, or `portfolio/evolution/legacy/antigravity-sdk-python/`. Add those four/five lines.

---

## Part 2 — Code structure: conflicts vs. SDOA-Governance-Outline v5.0

**1. Two parallel first-party roots.** `portfolio\` actually implements the canonical `sdoavx/` layout (ui, substrate, evolution, authorities). `server\` (189 files) is a completely separate flat `src/` backend that ignores that layout entirely. The governance doc doesn't acknowledge a second root — either `server/` needs to be folded into the canonical structure, or the doc needs an amendment (Section 10) formally scoping it out, the way Section 11 already does for the Cloudflare mcp-worker.

**2. Prohibited directory.** `server\public\legacy_v2\assets\` — this is first-party source (not vendor output) sitting in an explicitly banned directory name (`/assets/`). Violation.

**3. Manifest compliance is nearly absent.** Only 5 `manifest.json` files exist anywhere in `portfolio/`, and all 5 are in `variants/*.legacy/` folders — none exist for a single non-legacy module, and none exist anywhere in `server/`. A few `.ui.js` files embed an inline `MANIFEST` object, but even those are missing `capabilities` and `last_modified` and use `requires` instead of the mandated `dependencies` key. Grepping for `"non-sdoa-compliant": true` across all first-party source returns zero hits — meaning ~250+ modules are undeclared-non-compliant, which the governance doc calls out explicitly as the one unacceptable state (Section 3.2).

**4. Files over the ~500-line hard cap:**
- `portfolio\ui\features\AppShell\AppShell.feature.js` — 1057
- `portfolio\ui\features\SplashScreen\SplashScreen.feature.js` — 1040
- `server\src\routes\dashboard.ts` — 1202 (and its compiled twin `dashboard.js` — 1219)
- `portfolio\substrate\workflows\Cartographer.workflow.js` — 1017
- `portfolio\ui\features\Chat\Chat.feature.js` — 970
- `portfolio\substrate\adapters\SleeveBase.module.js` — 893
- `portfolio\ui\features\Settings\Settings.feature.js` — 713
- `portfolio\ui\features\ProjectManager\ProjectManager.feature.js` — 690
- `portfolio\substrate\services\Oracle.service.js` — 680
- `portfolio\ui\features\Blueprint\Blueprint.feature.js` — 657
- `portfolio\ui\features\Playground\Playground.feature.js` — 628
- `portfolio\substrate\adapters\LocalModelAdapter.js` — 529
Watch-list (under but close): `FileManager.js` (488), `Sentinel.service.js` (487), `MultiModelOrchestrator.js` (484).

**5. Naming convention violations.** The governance doc only sanctions `.prim.js/.feature.js/.adapter.js/.workflow.js/.repository.js/.service.js`. In practice there's widespread use of unsanctioned suffixes: `.ui.js` (dozens of files across `portfolio\ui\` and `portfolio\substrate\`), `.module.js` (`SleeveBase`, `BrowserSleeve`, `QwenSleeve`, `PolicySleeve`), `.persistence.js` (`Chronicle.persistence.js`), and an ad hoc `PartnerTicker.v3.ui.js` that invents its own versioning scheme instead of the mandated `Parent.variant.type.ext` pattern.

**6. Undeclared duplicate/variant conflicts.** Confirmed by reading contents (not just filenames) — several modules exist as near-identical triplicates across unrelated folders, none declared as a variant per Section 9:
- `BackendConnector.ui.js` in `portfolio\ui\adapters\`, `portfolio\ui\components\`, **and** `portfolio\substrate\adapters\` (verified — all three exist)
- Same triplication pattern for `LlmBridge.ui.js`, `LlmPolicyEngine.ui.js`, `QmdAdapter.ui.js`
- `EventBus.ui.js` duplicated across `ui/components`, `ui/lib`, `substrate/services`
- `FileList.ui.js`, `FileTree.ui.js`, `ManifestPanel.ui.js` each duplicated between `ui/components/` and `ui/primitives/{Name}/`
- `PartnerTicker.v3.ui.js` duplicated across `ui/adapters/`, `ui/components/`, `ui/features/PartnerTicker/`

Several of these files contain a header comment reading *"Relocated to canonical sdoavx/ structure"* — meaning this looks like a half-finished migration: files were copied to their new canonical home but the old copies were never deleted and none were ever formally declared as variants.

**7. `server/src` mixes compiled `.js` next to hand-written `.ts`** for the same module across the board (`Router`, `logger`, `dashboard`, `events`, `telemetry`, `database`, `offlineSync`, `handshake`, all of `validators/*`) — looks like build output got committed into the source tree.

---

## Part 3 — Suggested priority order

1. **Secrets first:** confirm `keys\sdoa-autopr...pem` and the three `.env` files were never committed; rotate anything that was. Add `wix314/`, `git-filter-repo-2.47.0/`, `build_staging/`, `extract_vsix/`, and the vendored Antigravity SDK path to `.gitignore`.
2. **Delete the disposable build trees** (`build_staging/`, `extract_vsix/`, `core/build/`, `core/cli/build/`, `dist/server/evolution/experimental/`) — they're all regeneratable.
3. **Resolve the two-root problem:** decide whether `server/` gets migrated into the canonical `substrate/`/`authorities/` layout, or gets a formal Section-11-style amendment carving it out (like the mcp-worker exception already does).
4. **Close the manifest gap:** this is the biggest compliance issue by volume — ~250+ modules with no manifest and no `non-sdoa-compliant` declaration. Even a bulk pass adding minimal compliant manifests (or explicit non-compliance declarations) would bring the repo into line with its own stated rule.
5. **Collapse the undeclared triplicates** (`BackendConnector.ui.js` and the others) into one canonical file each, with any real alternate implementations moved into `variants/` and given `variant_of` manifests.
6. **Split the oversized feature files**, starting with `AppShell.feature.js` (1057) and `dashboard.ts` (1202) — the governance doc treats hitting 500 lines as "the architecture telling you a refactor is overdue," not a style nit.
7. **Clean `server/src`** of checked-in `.js` twins of `.ts` files.

---

*Note: `project_portfolio.md` (from your Antigravity session) lists the actual SDOAvX application source as living at `C:\Projects\SDOAvX`, a separate path not connected to this Cowork session. Everything above reflects only what's inside `C:\MCP` — if `C:\Projects\SDOAvX` is a distinct codebase rather than an alias for this one, it hasn't been audited here.*
