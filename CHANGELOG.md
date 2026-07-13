# Changelog

All notable changes to the SDOA MCP Extension are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) and [Semantic Versioning](https://semver.org/).

---

## [1.5.2] — 2026-07-13

### Fixed
- Corrected publisher ID from `sdoa-vx` → `SDOAvX` to match the registered VS Marketplace and Open VSX publisher account — extension now appears correctly in both registries
- Updated Open VSX namespace creation to use `SDOAvX`
- Eliminated all CI annotation noise: "already published" and "already exists" states now exit cleanly with a `✅ skip` message instead of error annotations
- Upgraded GitHub Actions to `checkout@v7` and `setup-node@v6` (Node 24-native), removing all Node 20 deprecation warnings

---

## [1.5.1] — 2026-07-13

### Fixed
- Added required marketplace metadata to `package.json`: `categories`, `keywords`, `galleryBanner`, `license`, `homepage`, `bugs` — extension is now searchable on VS Marketplace
- Corrected extension display name from `"1.1 SDOA MCE"` → `"SDOA MCP Extension"`
- All publish steps are now idempotent — re-runs on already-published versions complete cleanly with no errors or annotations

---

## [1.5.0] — 2026-07-13

### Added

#### SDOA Community Library Dashboard
- New REST API routes exposing canonical module library, manifests, lineage tree references, and PR history
- Dynamic VS Code Webview panels for browsing and filtering canonical modules
- Attribution display using author hash (anonymization-ready, never blocking)
- New MCP cloud tool: `sdoa.getCanonicalLibrary`

#### Compliance Scoring Engine
- New MCP cloud tool: `sdoa.scoreCompliance` — returns per-module compliance scores
- Compliance is **informational only** — no PRs are blocked; the system encourages, not penalises
- Supabase migration: `sdoa_compliance_scores` table

#### Lineage Tree Visualizer
- New MCP cloud tool: `sdoa.getLineageTree` — returns full ancestry chains for any module
- Interactive VS Code Webview tree renderer with collapsible nodes
- Supabase migration: `sdoa_lineage_tree` table

#### Multi-Agent Refinement
- New MCP cloud tool: `sdoa.multiRefine` — orchestrates parallel agent refinement passes
- Integrated with `Orchestrator.service.ts`
- Supabase migration: `sdoa_refinement_jobs` table

### Infrastructure
- First-time publication to Open VSX Registry and VS Marketplace via CI/CD
- GitHub Pages documentation site added under `/docs`
- `package-lock.json` now tracked in version control for reproducible CI installs
- `layerEnforcer.ts` committed — fixes TypeScript build errors in CI
- Version bumped across `package.json`, splash screen badge, MSI build scripts, and cloud client telemetry

---

## [1.4.9] — Prior Release

### Added

#### Dual-Channel Telemetry
- New Go-based telemetry ingest microservice (`mesh/telemetry/`)
- Parallel ingestion pipeline: local SQLite + remote Supabase
- `tracksdoa-v2` SvelteKit UI with real-time proposal and scan channels via Supabase subscriptions
- `scanChannel.ts` and `proposalChannel.ts` reactive state stores

#### Scanner Pipeline
- Rebuilt `CreationPipeline.ts` with full proposal wiring
- `PostScanProposals.svelte` redesigned with live proposal state management

#### Time Machine & Chronicle
- `mesh/time_machine/` Go service for deterministic state reconstruction
- `chronicleBridge.ts` IPC bridge: VS Code ↔ local server ↔ time machine
- `loadChronicle.ts` client-side loader

#### Governance Sigils
- Full governance UI with sigil-based authority system (`GovernanceSigils` component)
- Governance and timeline routes wired into SvelteKit layout

#### Living Mesh — Phase 2 & 3
- Go mesh microservices: `triage_effects/`, `time_machine/`, `telemetry/`, `test_emitter/`
- `scripts/build_mesh.ps1` and `start_mesh.ps1` for local mesh orchestration
- `lookingGlass.ts` — server-side introspection and module transparency engine

#### Dashboard Overhaul
- Full SvelteKit build replacing legacy static dashboard
- New routes: `drift`, `governance`, `lineage`, `mesh`, `proposals`, `routing`, `scan`, `time-machine`, `timeline`
- `ui/tokens.css` comprehensive design token system

---

## [1.3.0] — Prior Release

### Added
- SDOA Living Mesh Phase 2 & 3 initial implementation
- Governance layer, Timeline view, Time Machine prototype
- CI: `workflow_dispatch` trigger added to publish workflow

---

[1.5.2]: https://github.com/sdoa-vx/CP/releases/tag/v1.5.2
[1.5.1]: https://github.com/sdoa-vx/CP/releases/tag/v1.5.1
[1.5.0]: https://github.com/sdoa-vx/CP/releases/tag/v1.5.0
[1.4.9]: https://github.com/sdoa-vx/CP/releases/tag/v1.4.9
[1.3.0]: https://github.com/sdoa-vx/CP/releases/tag/v1.3.0
