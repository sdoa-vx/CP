# SDOA Platform — Unifying Roadmap

**Status:** Planning. No code is written from this document until the sequencing below is confirmed.
**Date:** 2026-06-25
**Purpose:** Reconcile the several things currently called "SDOA," locate the C++ engine we just built within them, and lay out the path from "a CLI nobody would want to use by hand" to the actual vision — a high-level, drag-and-drop / AI-agent-composable programming platform that swaps into the MCP.

---

## 0. Why this document exists

You built the C++ engine, gave it a CLI/SDK/dashboard, started playing with it, and correctly sensed that *no one would actually want to use it this way*. That instinct is right — and the reason is twofold:

1. **The CLI is the substrate's control port, not the product.** A pipeline is JSON in / JSON out; the CLI scaffolds, validates, and packages — it was never meant to be the surface a human or an agent composes against.
2. **"SDOA" refers to four different artifacts in this repo**, and they have quietly blended together. Until they're named apart, every "what is this for?" question feels unanswerable.

This roadmap fixes #2 first (you can't sequence what you can't name), then addresses #1 with a concrete build order.

---

## 1. The things called "SDOA"

Across the project's docs, "SDOA" has referred to several artifacts. They collapse to three:

| # | Name (proposed) | What it actually is | Language / form | Status |
|---|---|---|---|---|
| 1 | **SDOA Discipline** | The *methodology*: sovereignty, layers, naming, line-limits, self-describing manifests. A way to organize code. | Rules + manifest spec (`SDOA-Governance-Outline.txt`, constraint set) | Defined, enforced on this repo |
| 2 | **SDOA Execution Engine** | A deterministic runtime that executes **capability pipelines** (JSON DAGs of typed, sandboxed steps). | **C++20**, + C ABI, + bindings | **Built** (this is what we just compiled) |
| 3 | **SDOA Scanner / Console** | One VS Code + web tool with three jobs: (a) scan a project and find where **existing catalog modules can replace chunks of code** (reuse-matching); (b) spot repetitive/replicable patterns and **harvest them into new modules** (portfolio growth); (c) give SDOA a **visible, tangible identity**. The earlier "9-phase migration pipeline" (`MCP-PIPELINE-PLAN.txt`) and "Governance Engine v1.1" docs are two descriptions of *this same tool*; the constraint solver is one check inside it, not the point. | Node/TS + local LLMs + embeddings | Planned, pre-code |

> **Originally listed as two artifacts** (a "Migration MCP" and a "Governance Engine v1.1"). They were never two things — they're one scanner/console. Compliance-enforcement is a feature of it, not its purpose; its purpose is **reuse + harvest + identity**.

These are **related but not the same product.** #1 is the rulebook. #2 is the execution kernel. #3 is the scanner that *grows and matches against* the catalog. The disorientation came from all of them wearing the same name.

**The crucial clarification:** the thing with the most leverage toward your stated vision ("drag-and-drop programming" + "AI agentic code building") is **#2, the Execution Engine** — but only once it has the right *surfaces* on top of it, and a rich **catalog** under it. #3 is what fills the catalog; #2 plus its surfaces is what makes the catalog usable.

---

## 2. The unifying mental model

Think of one stack, not four products:

```
  Consumers        Humans (drag & drop)        AI agents (compose & run)
                          │                              │
  ─────────────────────── │ ──────────────────────────── │ ───────────────
  Authoring surfaces   Visual Builder    CLI (built)    MCP Server
  (front-ends)         (future)          dev/diagnostic (agentic surface)
                          │                  │               │
                          └──────────┬───────┴───────────────┘
                                     ▼
                       Pipeline JSON  (the universal artifact)
                                     ▼
  ─────────────────────────────────────────────────────────────────────
  Interop            libsdoa  (C ABI)  →  Python / Node / Rust bindings   [built]
                                     ▼
  Execution kernel   SDOA Execution Engine (C++20)                        [built]
                     deterministic DAG scheduler · capability registry ·
                     JSON-schema validation · sandbox flags · trace
                                     ▼
  Contract           SDOA Discipline (manifests, sovereignty, layers)     [defined]
```

**Everything above the kernel exchanges the same artifact: a pipeline (a JSON DAG of capability steps).** A human dragging nodes onto a canvas *emits* pipeline JSON. An agent reasoning over the capability catalog *emits* pipeline JSON. The CLI *validates and packages* pipeline JSON. They are all front-ends to one engine. This is why the engine being "hard to use by hand" is not a defect — it's the floor that every usable surface stands on.

The Scanner/Console (#3) sits *beside* this stack and feeds it.

### Two loops, one hub

The hub is the **engine + its capability/module registry** (built). Two value loops turn around it:

- **Loop A — Execution** (this roadmap's Run → MCP → GUI): humans and agents *compose and run* pipelines from the catalog. "Use the modules."
- **Loop B — Portfolio** (the Scanner/Console, #3): scan code → *match* against the catalog (reuse) and *harvest* new modules into it. "Grow the modules." Loop B is what makes Loop A worth doing — an empty catalog has nothing impressive to drag-and-drop or hand an agent.

These loops compound: a richer catalog makes the next scan find more reuse, which surfaces the gaps worth harvesting, which enriches the catalog.

### Loop B is not a cold start

A scan of `D:\projects\SDOAvX` found an existing, real portfolio of **~55 distinct first-party modules** (≈67 counting `.js`/`.ts` twins) — orchestration (Conductor, Captain, Router, Registrar), memory/persistence (Chronicle, MemoryContextBroker, PersistentMemory), governance (Sentinel, ProbationOfficer, Oracle, Pulse, Triage), LLM plumbing (AiProvider, LlmConnector, TokenBudget, LocalLlmServer), dev tooling (Scaffold, Cartographer, Interpreter, TestRunner), and a UI kit (Blueprint, Playground, primitives). Full inventory: [SDOA-Module-Catalog.md](SDOA-Module-Catalog.md).

**Implication:** the engine's catalog is currently near-empty (stdlib + two example modules), but the *library* is not. The gap is representational, not substantive — these modules carry the **v5 source-manifest** format (embedded `MANIFEST`; id/type/layer/runtime/operationalRole/lifecycle) rather than the engine's `module.json` + runtime-entry format. Reconciling the two is the **format-bridge / registry-as-hub** workstream (§6).

---

## 3. The keystone gap: there is no easy "run"

Today, executing a pipeline requires writing code against a binding. The CLI has `new / validate / manifest / codegen / module / key / dashboard / docs` — but **no `run`**. That single missing verb is why "playing with it" hits a wall, and it blocks both the GUI and the MCP server, because both need exactly one thing from the engine: *given a pipeline + input, run it and return the result.*

So the roadmap's first move is to define and build a **stable run contract**, then expose it everywhere.

> **Run contract (proposed):**
> Input: `{ pipeline: <pipeline JSON>, input?: <JSON>, options?: { strict, trace, isolate } }`
> Output: `{ ok: bool, outputs: { <step>: <JSON> }, trace?: [...], error?: { code, details } }`
> One contract, consumed identically by the CLI (`sdoa run`), the MCP server, and the visual builder.

---

## 4. Roadmap (sequenced: Run → MCP → GUI)

### Phase R — Execution surface  *(small, unblocks everything)*

**Goal:** make "run a pipeline" a first-class, one-call operation.

- Add `sdoa run <pipeline.json> [--input in.json] [--strict] [--trace]` to the CLI, returning the run-contract JSON.
- Back it with a single ABI entry (compose-model+pipeline-from-one-doc → run → result) so non-C++ callers get the same one-shot path the CLI uses.
- Accept an *inline* pipeline doc that carries its own model declaration, so a caller doesn't have to issue three separate load calls.

**Reuses:** the engine's existing scheduler, schema validation, trace, and the two-call buffer ABI — all built. This is plumbing, not new mechanism.

**Done when:** `sdoa run pipeline.json` prints results for a stdlib-only pipeline *and* for one with a registered foreign capability; errors come back as structured `{code, details}`.

**Effort:** small.

### Phase M — Execution MCP server  *(highest leverage, proves the thesis)*

**Goal:** let any MCP-speaking agent introspect the capability catalog, compose a pipeline, and run it deterministically — i.e. "highly compatible with AI agentic code building," realized.

Expose a thin MCP server over `libsdoa` with tools roughly:

- `sdoa_list_capabilities()` → the manifest (every capability + input/output schema). *This is the agent's typed catalog.*
- `sdoa_describe_capability(name)` → one capability's schema + flags + docs.
- `sdoa_validate_pipeline(pipeline)` → structured errors before running.
- `sdoa_run_pipeline(pipeline, input?)` → the run contract from Phase R.
- (optional) `sdoa_compose(goal)` → helper that returns a skeleton pipeline for the agent to fill.

**Why this is the safety story, not just convenience:** an agent assembling *pre-vetted, schema-typed, sandboxed capabilities* into a DAG is far more deterministic and reviewable than an agent emitting raw code. The schemas are the contract it plans against; the sandbox flags are the guardrail; the engine guarantees deterministic execution. SDOA turns "AI writes arbitrary code" into "AI assembles trusted blocks."

**Relationship to the Scanner/Console (artifact #3):** they are **two different MCP surfaces** serving the two loops. This Execution MCP *runs* pipelines (Loop A); the Scanner *matches and harvests* modules (Loop B). They meet at the catalog: the Scanner's reuse-matching queries the same capability catalog this MCP exposes, and its harvested modules (scaffolded via `codegen`, packed/signed via the module system) become new entries both surfaces see. The Scanner's deterministic steps can themselves be expressed as engine pipelines and run via `sdoa_run_pipeline`, so the engine becomes the execution backend the Scanner delegates to — the concrete meaning of "swap the engine into the MCP."

**Reuses:** the manifest + JSON-schema work (built), Phase R's run contract, the existing bindings.

**Done when:** an agent (e.g. via this assistant) can call `list_capabilities`, build a 2-step pipeline, `validate`, `run`, and get correct output — with no human writing engine code.

**Effort:** medium; mostly wrapping, little new engine work.

### Phase G — Visual drag-and-drop builder  *(most visible, largest effort — do last)*

**Goal:** the "high-level drag-and-drop to get impressive programming out of it" surface.

- **Node palette = the manifest.** Every capability you already emit *is* a node spec: its `input_schema`/`output_schema` define the ports. The palette is rendered data we already produce.
- **Canvas → pipeline JSON.** Dragging nodes and wiring ports builds exactly the DAG (`@step.output` edges) the engine consumes.
- **Run = Phase R / Phase M.** The "Run" button calls the same run contract; no new execution path.
- **Live results = the trace protocol + dashboard** you already built (the static dashboard is the read-only ancestor of this view).

**Reuses:** manifest, schemas, run contract, dashboard/trace assets — all built or planned earlier in this roadmap.

**Done when:** a non-programmer can drag two capabilities, connect them, hit Run, and see output — producing the same pipeline JSON an agent would.

**Effort:** large (it's a real browser app), but architecturally it invents almost nothing new.

---

## 5. How the engine "swaps into the MCP"

Your phrase, made concrete, has two complementary readings and the roadmap serves both:

1. **The engine becomes an MCP-exposed execution backend** (Phase M). Agents drive it directly. This is the cheap, high-value path.
2. **The prior Migration-MCP plan re-targets onto the engine.** Where that 9-phase pipeline currently imagines bespoke Node services doing deterministic work, those steps become engine capabilities/pipelines, and the migration server calls `sdoa_run_pipeline`. The engine supplies determinism, sandboxing, schema-validation, versioning, and signing — all of which the migration plan otherwise has to reinvent.

Either way, the C++ engine stops being a standalone curiosity and becomes the **shared execution kernel** under both the agentic surface and the governance tooling. "Pieces of it used to build any number of things" = capabilities + the run contract, reused by every surface.

---

## 6. Decisions to make before building

- **Format bridge / registry-as-hub (new workstream).** The ~55-module SDOAvX portfolio uses the v5 source-manifest format; the engine's catalog expects `module.json` + a runtime entry. Decide how a v5 module becomes a first-class catalog entry: a manifest translator + a registry that records identity/capabilities independent of runtime, with execution routed by the `runtime` field (Python binding / Node binding / native). This is the bridge that turns the existing library into Loop A's usable catalog. See [SDOA-Module-Catalog.md](SDOA-Module-Catalog.md) for the inventory and its cleanup flags (`.js`/`.ts` twins, `Registry.service` triple-registration, ambiguous manifests) to resolve during import.
- **Execution mode for authored pipelines.** In-process (fast, default) vs out-of-process/isolated (the seccomp + `modhost` PoC). For agent- or GUI-authored pipelines from untrusted sources, isolation matters; decide the default and the override. Note: SDOAvX modules in JS/Python execute via their bindings, which already implies out-of-process for those runtimes.
- **How new capabilities enter the system.** When an agent (or user) needs a capability that doesn't exist, what happens? Options already partly built: `codegen` (scaffold), the module system (compile + `pack` + `install`), signing/trust. Decide the "author a new capability" loop — this is where the Scanner's harvest phase and the engine meet.
- **One dashboard or two.** The static trace dashboard (built) vs the Scanner/Console's governance views (described). Recommend folding both into one dashboard rather than maintaining two.
- **Does the Scanner's prior phase-pipeline plan stand as-is, or get re-scoped onto the engine?** Recommend re-scoping: keep its phase model and constraint solver, but run deterministic work through the engine.
- **Naming.** Strongly recommend giving the artifacts distinct names in all future docs (e.g. *SDOA Discipline*, *SDOA Engine*, *SDOA Scan*) to end the conflation permanently.

---

## 7. Recommended next step

Build **Phase R** (small, unblocks the rest), then a **thin Phase M** MCP server to validate the whole agentic thesis end-to-end before investing in the GUI. Phase G follows once a human can already drive the engine through an agent and the run contract is proven.

## 8. North star

A capability catalog that is *typed, sandboxed, deterministic, versioned, and signable*; one run contract; and two front-ends to it — a drag-and-drop canvas for humans and an MCP surface for agents — both emitting the identical pipeline the C++ kernel executes. The engine we built is the kernel. Everything remaining is surfaces and wiring on top of work that already exists.
