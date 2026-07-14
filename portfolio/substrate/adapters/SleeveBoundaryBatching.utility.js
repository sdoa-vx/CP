// ──────────────────────────────────────────────────────────────────
// File:    SleeveBoundaryBatching.utility.js
// Version: 1.0.0
// Updated: 2026-07-14T00:00:00Z
// Changes: Extracted from SleeveBase.module.js (Phase 5 — oversized-file
//          split). Carries Amendment 4.5 — Boundary Compression &
//          Batching:
//
//          batchExternalCalls(calls[]) — dispatches N { command, payload }
//            tuples as grouped chunks (external.maxBatchSize, default 10).
//            Each chunk calls _executeBatch() [subclass override for true
//            batching; default is sequential fallback]. Emits
//            sleeve:batchDispatched. Returns { ok, batchId, results[], durationMs }.
//          compressPayload(payload, command?) — zlib deflate JSON payload.
//            Returns { _compressed, _encoding, data, originalBytes,
//            compressedBytes }. Emits sleeve:payloadCompressed.
//          decompressPayload(compressed) — inflates back to object.
//            Passes through non-compressed payloads transparently.
//          _executeBatch(calls[]) [subclass stub] — sequential fallback;
//            subclasses override for native batched API calls.
//
//          SleeveBase.run() still calls this.compressPayload() directly
//          when external.compression === true — that call site stayed in
//          run() (lifecycle contract), only the compressPayload()
//          implementation itself moved here.
//
//          Prototype mixin (applied via Object.assign in
//          SleeveBase.module.js), not an instantiated module — see the
//          header note in SleeveTransportNegotiation.utility.js for why
//          this phase uses prototype mixins rather than composed helper
//          instances for SleeveBase's split (_executeBatch is a
//          subclass-override stub).
// ──────────────────────────────────────────────────────────────────
// SleeveBoundaryBatching.utility.js — SDOA v5 Utility (NodeJS)
// ──────────────────────────────────────────────────────────────────

"use strict";

const zlib = require("zlib");
const { randomUUID } = require("crypto");

const MANIFEST = {
  id:           "SleeveBoundaryBatching.utility",
  type:         "utility",
  layer:        3,
  runtime:      "NodeJS",
  version:      "1.0.0",
  capabilities: ["sleeve.boundary.batch", "sleeve.boundary.compress", "sleeve.boundary.decompress"],
  dependencies: [],
  docs: {
    description: "Prototype mixin (applied via Object.assign, not instantiated) contributing Amendment 4.5 boundary compression and batching to SleeveBase.module.js: batchExternalCalls(), compressPayload(), decompressPayload(), and the _executeBatch() subclass-override stub. Extracted from SleeveBase.module.js as part of the Phase 5 oversized-file split.",
    author: "ProtoAI team"
  },
  last_modified: "2026-07-14T00:00:00Z"
};

const SleeveBoundaryBatchingMixin = {

  // ── Amendment 4.5 — Boundary Compression & Batching ──────────

  async batchExternalCalls(calls = []) {
    if (!calls.length) return { ok: false, error: "batchExternalCalls: no calls provided" };
    const manifest = this.constructor.MANIFEST;
    const external = manifest?.external ?? {};
    const base     = this._base(manifest, external);
    const batchId  = randomUUID();
    const maxSize  = external.maxBatchSize ?? 10;
    const t0       = Date.now();
    const results  = [];

    for (let i = 0; i < calls.length; i += maxSize) {
      const chunk = calls.slice(i, i + maxSize);
      let chunkResults;
      try   { chunkResults = await this._executeBatch(chunk); }
      catch (err) { chunkResults = chunk.map(() => this._fail(err.message)); }
      results.push(...chunkResults);
    }

    const ok = !results.some(r => !r.ok);
    const durationMs = Date.now() - t0;

    this._emit("sleeve:batchDispatched", { ...base, batchId, callCount: calls.length, durationMs, ok });
    try { this._registry?.get?.("Pulse.workflow")?.recordSample?.({ moduleId: manifest.id, commandId: "batch", durationMs, success: ok }); } catch (_) {}

    return { ok, batchId, results, callCount: calls.length, durationMs };
  },

  compressPayload(payload, command = null) {
    const manifest = this.constructor.MANIFEST;
    const external = manifest?.external ?? {};
    const json     = JSON.stringify(payload);
    const buf      = Buffer.from(json, "utf8");
    const deflated = zlib.deflateSync(buf);
    const originalBytes   = buf.length;
    const compressedBytes = deflated.length;
    const compressionRatio = parseFloat((compressedBytes / originalBytes).toFixed(3));

    this._emit("sleeve:payloadCompressed", {
      ...this._base(manifest, external),
      command:          command ?? null,
      originalBytes,
      compressedBytes,
      compressionRatio
    });

    return { _compressed: true, _encoding: "deflate", data: deflated.toString("base64"), originalBytes, compressedBytes };
  },

  decompressPayload(compressed) {
    if (!compressed?._compressed) return compressed;
    try {
      const buf = Buffer.from(compressed.data, "base64");
      return JSON.parse(zlib.inflateSync(buf).toString("utf8"));
    } catch (err) {
      return { _decompressError: err.message, _original: compressed };
    }
  },

  // Override in subclasses that support native batched API calls.
  // Must return an array of normalized responses in the same order as calls[].
  // Default: sequential fallback — functionally correct, no native batching benefit.
  async _executeBatch(calls) {
    const results = [];
    for (const call of calls) {
      try { results.push(this._normalize(await this._callExternal(call.command, call.payload ?? {}, this._activeTransport))); }
      catch (err) { results.push(this._fail(err.message)); }
    }
    return results;
  }

};

module.exports = { MANIFEST, mixin: SleeveBoundaryBatchingMixin };
