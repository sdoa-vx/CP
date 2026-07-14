// ──────────────────────────────────────────────────────────────────
// File:    SleeveSandbox.utility.js
// Version: 1.0.0
// Updated: 2026-07-14T00:00:00Z
// Changes: Extracted from SleeveBase.module.js (Phase 5 — oversized-file
//          split). Carries Amendment 3.5 — Sleeve Sandbox Mode:
//
//          enterSandbox({ fixtures? }) — intercepts _callExternal(); the
//            real external system is never contacted while sandbox is
//            active.
//          exitSandbox() — restores normal operation.
//          injectFixture(command, response|fn) — add/update a fixture;
//            fn(command, payload) form enables dynamic/stateful responses.
//          replayFromChronicle({ since? }) — loads Chronicle
//            sleeve:boundaryCall history as ordered queues and enters
//            replay+sandbox mode. Each command's queue dequeues in
//            arrival order; an exhausted queue returns a synthetic error.
//          _runSandbox(command, payload) — internal: executes a run()
//            call against fixtures instead of the real external system.
//            Emits sleeve:sandboxRun (NOT sleeve:boundaryCall) so Triage,
//            Cartographer, and Pulse never see synthetic data.
//
//          Prototype mixin (applied via Object.assign in
//          SleeveBase.module.js), not an instantiated module — see the
//          header note in SleeveTransportNegotiation.utility.js for why
//          this phase uses prototype mixins rather than composed helper
//          instances for SleeveBase's split.
// ──────────────────────────────────────────────────────────────────
// SleeveSandbox.utility.js — SDOA v5 Utility (NodeJS)
// ──────────────────────────────────────────────────────────────────

"use strict";

const MANIFEST = {
  id:           "SleeveSandbox.utility",
  type:         "utility",
  layer:        3,
  runtime:      "NodeJS",
  version:      "1.0.0",
  capabilities: ["sleeve.sandbox.enter", "sleeve.sandbox.exit", "sleeve.sandbox.fixture", "sleeve.sandbox.replay"],
  dependencies: [],
  docs: {
    description: "Prototype mixin (applied via Object.assign, not instantiated) contributing Amendment 3.5 sandbox mode to SleeveBase.module.js: enterSandbox(), exitSandbox(), injectFixture(), replayFromChronicle(), and the internal _runSandbox() dispatcher. Extracted from SleeveBase.module.js as part of the Phase 5 oversized-file split.",
    author: "ProtoAI team"
  },
  last_modified: "2026-07-14T00:00:00Z"
};

const SleeveSandboxMixin = {

  // ── Amendment 3.5 — Sleeve Sandbox Mode ───────────────────────

  // Switch the sleeve into sandbox mode. All run() calls will hit
  // _runSandbox() instead of _callExternal(). Optional fixtures map
  // (command → response|fn) pre-seeds the fixture table.
  enterSandbox({ fixtures } = {}) {
    this._sandboxMode = true;
    this._replayMode  = false;
    this._fixtures.clear();
    if (fixtures && typeof fixtures === "object") {
      for (const [cmd, resp] of Object.entries(fixtures)) {
        this._fixtures.set(cmd, resp);
      }
    }
    return { ok: true };
  },

  // Restore real operation and clear all fixtures.
  exitSandbox() {
    this._sandboxMode = false;
    this._replayMode  = false;
    this._fixtures.clear();
    return { ok: true };
  },

  // Add or replace a single fixture. Use command="*" for a wildcard
  // that matches any command not otherwise registered.
  // Value may be a static response object or fn(command, payload) for
  // dynamic / stateful responses.
  injectFixture(command, response) {
    this._fixtures.set(command, response);
    return { ok: true };
  },

  // Load Chronicle sleeve:boundaryCall history for this sleeve as
  // ordered per-command queues, then enter replay+sandbox mode.
  // Each queue dequeues in arrival order (oldest first); an exhausted
  // queue returns a synthetic error rather than blocking.
  async replayFromChronicle({ since } = {}) {
    const chronicle = this._registry?.get?.("Chronicle.service");
    if (!chronicle?.query) return { ok: false, fixtures: 0 };

    const manifest = this.constructor.MANIFEST;
    const sinceMs  = since ? new Date(since).getTime() : 0;

    const entries = (chronicle.query({ type: "sleeve:boundaryCall" }) ?? [])
      .filter(e => e.payload?.moduleId === manifest.id)
      .filter(e => new Date(e.payload?.timestamp ?? e.recordedAt ?? 0).getTime() >= sinceMs)
      .sort((a, b) => new Date(a.payload?.timestamp ?? 0) - new Date(b.payload?.timestamp ?? 0));

    const queues = {};
    for (const entry of entries) {
      const cmd = entry.payload?.command;
      if (!cmd) continue;
      if (!queues[cmd]) queues[cmd] = [];
      queues[cmd].push(
        entry.payload?.ok !== false
          ? { ok: true,  data:  { replay: true, originalTimestamp: entry.payload?.timestamp } }
          : { ok: false, error: "[replay] original call returned error" }
      );
    }

    this._fixtures.clear();
    let count = 0;
    for (const [cmd, queue] of Object.entries(queues)) {
      // Closure captures queue by reference — dequeues in order
      const q = queue;
      this._fixtures.set(cmd, () =>
        q.length > 0 ? q.shift() : { ok: false, error: `[replay] queue for "${cmd}" exhausted` }
      );
      count += q.length;
    }

    this._sandboxMode = true;
    this._replayMode  = true;
    return { ok: true, fixtures: count };
  },

  // Internal: execute a run() in sandbox mode.
  // Emits sleeve:sandboxRun (NOT sleeve:boundaryCall) — intentional.
  async _runSandbox(command, payload) {
    const manifest   = this.constructor.MANIFEST;
    const external   = manifest?.external ?? {};
    const base       = this._base(manifest, external);
    const t0         = Date.now();

    // Fixture lookup: exact command match, then wildcard
    const fixtureKey = this._fixtures.has(command) ? command
                     : this._fixtures.has("*")     ? "*"
                     :                               null;
    const fixture    = fixtureKey !== null ? this._fixtures.get(fixtureKey) : undefined;

    let result;
    if (fixture === undefined) {
      result = { ok: false, error: `[sandbox] No fixture registered for command "${command}"` };
    } else if (typeof fixture === "function") {
      try   { result = this._normalize(await fixture(command, payload)); }
      catch (err) { result = this._fail(`[sandbox] fixture threw: ${err.message}`); }
    } else {
      result = this._normalize(fixture);
    }

    const durationMs = Date.now() - t0;

    // sleeve:sandboxRun — Chronicle only; NOT consumed by Triage/Cartographer/Pulse
    this._emit("sleeve:sandboxRun", {
      ...base,
      command,
      durationMs,
      ok:         result.ok ?? false,
      replay:     this._replayMode,
      fixtureKey: fixtureKey ?? null
    });

    return result;
  }

};

module.exports = { MANIFEST, mixin: SleeveSandboxMixin };
