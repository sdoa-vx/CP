// ──────────────────────────────────────────────────────────────────
// File:    SleeveTransportNegotiation.utility.js
// Version: 1.0.0
// Updated: 2026-07-14T00:00:00Z
// Changes: Extracted from SleeveBase.module.js (Phase 5 — oversized-file
//          split). Carries Amendment 4.1 — Sleeve Transport Negotiation:
//
//          Sleeves may declare external.transports[] (ordered preference
//          list). negotiateTransport(trigger?) probes each candidate,
//          scores by Chronicle history (p95, error rate) + probe latency,
//          selects the best viable transport, updates this._activeTransport,
//          and emits sleeve:transportNegotiated when the selection changes.
//
//          _probeTransport(transport) is a documented subclass-override
//          hook ("Override in subclasses for transport-specific
//          availability probing") — that is why this is a *prototype
//          mixin* (a plain object of methods applied to SleeveBase.prototype
//          via Object.assign in SleeveBase.module.js) rather than a
//          composed helper instance. A helper-instance/delegation split
//          (the pattern used for Oracle.service.js in this same phase)
//          would move _probeTransport off SleeveBase's own prototype chain
//          and silently break every future sleeve subclass's ability to
//          override it. Object.assign onto the prototype keeps these
//          methods indistinguishable from methods defined inline in the
//          class body, so subclass overrides keep working exactly as
//          before.
// ──────────────────────────────────────────────────────────────────
// SleeveTransportNegotiation.utility.js — SDOA v5 Utility (NodeJS)
//
// Not independently instantiated or registry-resolvable — this module
// has no standalone identity. It exists purely to keep
// SleeveBase.module.js under the Layer 3 line cap while preserving the
// flat this.negotiateTransport() / this._probeTransport() surface that
// SleeveBase and its future subclasses depend on.
// ──────────────────────────────────────────────────────────────────

"use strict";

const MANIFEST = {
  id:           "SleeveTransportNegotiation.utility",
  type:         "utility",
  layer:        3,
  runtime:      "NodeJS",
  version:      "1.0.0",
  capabilities: ["sleeve.transport.negotiate", "sleeve.transport.score", "sleeve.transport.probe"],
  dependencies: [],
  docs: {
    description: "Prototype mixin (applied via Object.assign, not instantiated) contributing Amendment 4.1 transport negotiation to SleeveBase.module.js: negotiateTransport(), _scoreTransport(), and the _probeTransport() subclass-override hook. Extracted from SleeveBase.module.js as part of the Phase 5 oversized-file split.",
    author: "ProtoAI team"
  },
  last_modified: "2026-07-14T00:00:00Z"
};

const SleeveTransportNegotiationMixin = {

  // ── Amendment 4.1 — Sleeve Transport Negotiation ──────────────

  async negotiateTransport(trigger = "explicit") {
    const manifest   = this.constructor.MANIFEST;
    const external   = manifest?.external ?? {};
    const transports = external.transports ?? [external.transport].filter(Boolean);
    if (transports.length <= 1) {
      return { ok: true, selectedTransport: this._activeTransport, changed: false, scores: [] };
    }

    const prev   = this._activeTransport;
    const scores = [];

    for (const t of transports) {
      const s = await this._scoreTransport(t);
      scores.push({ transport: t, ...s });
    }

    const viable = scores.filter(s => s.viable !== false).sort((a, b) => b.score - a.score);
    const best   = viable[0] ?? scores[0];

    const changed = best.transport !== prev;
    this._activeTransport = best.transport;

    if (changed) {
      this._emit("sleeve:transportNegotiated", {
        ...this._base(manifest, external),
        previousTransport: prev ?? "none",
        selectedTransport: best.transport,
        trigger,
        reason:  best.reason ?? "score-based",
        scores:  scores.map(s => ({ transport: s.transport, score: s.score, viable: s.viable ?? true, reason: s.reason ?? "" }))
      });
    }

    return { ok: true, selectedTransport: best.transport, changed, scores };
  },

  async _scoreTransport(transport) {
    let viable = true, probeMs = null;
    try { ({ viable = true, latencyMs: probeMs = null } = await this._probeTransport(transport) ?? {}); }
    catch (_) { viable = false; }
    if (!viable) return { score: -Infinity, viable: false, reason: "not-viable" };

    let score = 10;
    const reasons = [];

    // Chronicle history for this transport
    const chronicle = this._registry?.get?.("Chronicle.service");
    if (chronicle?.query) {
      const id      = this.constructor.MANIFEST?.id;
      const entries = (chronicle.query({ type: "sleeve:boundaryCall" }) ?? [])
        .filter(e => e.payload?.moduleId === id && e.payload?.transport === transport);
      if (entries.length >= 5) {
        const sorted = entries.map(e => e.payload?.durationMs ?? 0).sort((a, b) => a - b);
        const p95    = sorted[Math.floor(sorted.length * 0.95)];
        if (p95 <  200) { score += 3; reasons.push("p95(fast)"); }
        else if (p95 > 2000) { score -= 3; reasons.push("p95(slow)"); }
        const errRate = entries.filter(e => !e.payload?.ok).length / entries.length;
        if (errRate > 0.20) { score -= 5; reasons.push("errorRate(high)"); }
        else if (errRate > 0.05) { score -= 2; reasons.push("errorRate(elevated)"); }
      }
    }

    if (probeMs !== null) {
      if (probeMs <  50)  { score += 2; reasons.push("probe(fast)"); }
      else if (probeMs > 500) { score -= 2; reasons.push("probe(slow)"); }
    }

    return { score, viable: true, reason: reasons.join(",") || "baseline" };
  },

  // Override in subclasses for transport-specific availability probing.
  // Return { viable: boolean, latencyMs: number|null }.
  // Default: assume all declared transports are viable (no-op probe).
  async _probeTransport(transport) {
    return { viable: true, latencyMs: null };
  }

};

module.exports = { MANIFEST, mixin: SleeveTransportNegotiationMixin };
