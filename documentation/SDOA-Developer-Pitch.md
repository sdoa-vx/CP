# SDOA — Developer-Targeted Pitch

**Audience:** developers, architects, eng leads — people who *have* a codebase. Not "everyman on Facebook." The punch stays; the aim changes.
**Lead differentiator:** SDOA is how humans **and AI agents** build software that doesn't rot — composable, typed, sandboxed modules instead of raw generated sprawl.
**Date:** 2026-06-25

---

## The one-liner (scroll-stopper for devs)

> **Your AI writes code faster than you can review it. SDOA makes it write *modules* instead — typed, sandboxed, self-describing, and safe to run.**

Alternates by vibe:

- *"Stop letting AI bolt spaghetti onto your repo. Give it building blocks instead."*
- *"Every SDOA module says who it is, what it takes, what it returns. Your agent plans against contracts, not vibes."*
- *"Run it on your codebase. If it finds reusable structure, great. If not — no harm, no foul."*

## Why a developer stops scrolling

Real pains, named plainly (no architecture buzzwords up front):

- AI coding assistants generate plausible code that nobody fully owns, and the repo entropy compounds.
- Refactors are terrifying because nothing declares its own dependencies or boundaries.
- "Don't touch that file or everything breaks" is a real line in real standups.

SDOA's answer: every module carries a **manifest** (id, type, inputs/outputs, dependencies, lifecycle). Modules are discovered, typed, and sandboxed. An agent — or a person — composes them into pipelines instead of writing one-off code. Refactor one module without breaking the world.

## The angle the old plan underweights: AI agents

This is the timely, true, differentiated story — lead with it:

> An LLM emitting raw code is fast and dangerous. An LLM **composing pre-vetted, schema-typed, sandboxed capabilities** is fast and *safe*. SDOA gives the agent a typed catalog to plan against and a deterministic engine to run on. That's the difference between "AI wrote some code" and "AI assembled a verifiable system."

This maps directly to the engine + MCP work (Loop A): `list_capabilities` → `compose` → `validate` → `run`. It's not a slogan; it's the architecture.

## The challenge (dev version — keep this, it's the best mechanic)

**#TrySDOA — Run it on your code.**

> Point the SDOA scanner at your repo. It never overwrites anything — it analyzes and reports: what's reusable, what's duplicated, what could be a module. If it surfaces something useful, you earned an insight (and an SDOA-Verified badge). If not, no harm, no foul.

> ⚠️ **Readiness gate (internal):** do not launch this publicly until the scanner reliably produces accurate, non-embarrassing output on *arbitrary* real repos. The campaign's entire power is "proof, not promises" — a tool that finds nothing or garbage on a stranger's code burns exactly the credibility the campaign is built on. Earn the demo first.

## Platform-specific copy

**Hacker News / Reddit (r/programming)** — lead with substance, not hype:
> *Show: SDOA — a manifest-driven architecture + scanner that turns a codebase into typed, sandboxed modules an AI agent can safely compose. Ran it on our own 55-module project; here's what it found and the engine that runs the result. Feedback welcome.*

**X / Twitter** (the hook):
> Your agent writes code. SDOA makes it write *modules* — typed, sandboxed, self-describing. Compose, validate, run. No more reviewing spaghetti you didn't write. 🧵

**LinkedIn** (eng leaders):
> Most teams don't need a rewrite — they need clarity and a safe way to let AI contribute. SDOA gives every module a manifest and runs them on a deterministic engine. Try the scanner on your repo: worst case, insight; best case, structure.

**dev.to / blog** (the proof piece — highest value):
> *"What the SDOA scanner found in a real codebase"* — a concrete before/after with the actual report and the diff. One honest case study outperforms the entire tagline kit.

## Mnemonic (pick one and commit)

- **Scan · Diagnose · Organize · Adapt** — mirrors the pipeline (best for the challenge).
- **Self-Describing · Organized · Alive** — best as a brand tagline.
- **"See-Do-Ah"** — most human/memorable for spoken contexts.

## Concrete-proof template (fill from SDOAvX)

The single most persuasive asset. Structure:

1. **Before** — a real messy/unstructured slice (screenshot or snippet).
2. **Run** — one command; the scanner report (counts by type, reuse candidates, harvest opportunities).
3. **After** — the recognized module(s) with their manifest, running on the engine.
4. **Numbers** — modules recognized, duplication found, lines saved. Real figures only.

You already have the inputs: the 55-module catalog (`SDOA-Module-Catalog.md`) and a live project. Build this *before* the challenge launches.

## Honest scope guardrails (so marketing matches reality)

- Say the MCP **analyzes, recommends, and scaffolds** — not "migrates your app automatically." Correct auto-generation is hard; overpromising it invites the disappointment that kills word-of-mouth.
- The badge ("SDOA-Verified") should mean something specific and checkable (valid manifests, no layer violations), not a vibe.
- Distribution claims (Open VSX, editor support) and testimonials are placeholders until real.

## North-star sequence

Make the scanner reliably impressive on real code → publish one concrete before/after → retarget copy to developers → lead with the AI-agent angle → launch #TrySDOA → use **TrackSDOA.US** as the living scoreboard that makes "SDOA in the wild" tangible.
