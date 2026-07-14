// ──────────────────────────────────────────────────────────────────
// File:    SleeveModelTraining.utility.js
// Version: 1.0.0
// Updated: 2026-07-14T00:00:00Z
// Changes: Extracted from SleeveBase.module.js (Phase 5 — oversized-file
//          split). Carries Amendment 4.4 — Sovereign Model Training
//          Pipeline:
//
//          trainLoRA({ trainingData, epochs?, rank? }) — triggers LoRA
//            fine-tuning via _trainLoRA() [subclass override]. Emits
//            sleeve:loraTrainingStarted + sleeve:loraTrainingComplete.
//          validateLoRA({ adapterId, testCases? }) — runs quality test
//            suite via _validateLoRA() [subclass override]. Emits
//            sleeve:loraValidated. Adapter state must be "trained".
//          proposeModelUpgrade({ adapterId, reason? }) — submits
//            validated adapter for governance approval. Emits
//            sleeve:modelUpgradeProposed. Requires state "validated"
//            AND passed=true. Sleeve cannot self-approve.
//          _trainLoRA() / _validateLoRA() / _loadAdapter() — subclass
//            override stubs.
//
//          this._adapterRegistry (Map: adapterId → lifecycle state)
//          remains a SleeveBase instance field — this mixin reads/writes
//          it via `this`, same as before the split. SleeveBase.init()
//          still owns the coach:modelUpgradeApproved subscription that
//          calls this._loadAdapter(); that wiring stayed in init() since
//          it's lifecycle plumbing, not training logic.
//
//          Prototype mixin (applied via Object.assign in
//          SleeveBase.module.js), not an instantiated module — see the
//          header note in SleeveTransportNegotiation.utility.js for why
//          this phase uses prototype mixins rather than composed helper
//          instances for SleeveBase's split (the three subclass-override
//          stubs here are the reason).
// ──────────────────────────────────────────────────────────────────
// SleeveModelTraining.utility.js — SDOA v5 Utility (NodeJS)
// ──────────────────────────────────────────────────────────────────

"use strict";

const { randomUUID } = require("crypto");

const MANIFEST = {
  id:           "SleeveModelTraining.utility",
  type:         "utility",
  layer:        3,
  runtime:      "NodeJS",
  version:      "1.0.0",
  capabilities: ["sleeve.model.trainLora", "sleeve.model.validateLora", "sleeve.model.proposeUpgrade"],
  dependencies: [],
  docs: {
    description: "Prototype mixin (applied via Object.assign, not instantiated) contributing Amendment 4.4 sovereign model training pipeline to SleeveBase.module.js: trainLoRA(), validateLoRA(), proposeModelUpgrade(), and the _trainLoRA()/_validateLoRA()/_loadAdapter() subclass-override stubs. Extracted from SleeveBase.module.js as part of the Phase 5 oversized-file split.",
    author: "ProtoAI team"
  },
  last_modified: "2026-07-14T00:00:00Z"
};

const SleeveModelTrainingMixin = {

  // ── Amendment 4.4 — Sovereign Model Training Pipeline ─────────

  async trainLoRA({ trainingData = [], epochs = 3, rank = 8 } = {}) {
    const manifest   = this.constructor.MANIFEST;
    const external   = manifest?.external ?? {};
    const base       = this._base(manifest, external);
    const adapterId  = randomUUID();

    this._adapterRegistry.set(adapterId, { state: "training", loss: null, score: null, passed: false });

    this._emit("sleeve:loraTrainingStarted", {
      ...base, adapterId, trainingDataSize: trainingData.length, epochs, rank
    });

    const t0 = Date.now();
    let loss = null, ok = true;
    try {
      const result = await this._trainLoRA(trainingData, epochs, rank, adapterId);
      loss = result?.loss ?? null;
    } catch (err) {
      ok = false;
      this._adapterRegistry.get(adapterId).state = "failed";
    }
    const durationMs = Date.now() - t0;

    if (ok) this._adapterRegistry.get(adapterId).state = "trained";
    if (loss !== null) this._adapterRegistry.get(adapterId).loss = loss;

    this._emit("sleeve:loraTrainingComplete", { ...base, adapterId, loss, durationMs, ok });
    return { ok, adapterId, loss, durationMs };
  },

  async validateLoRA({ adapterId, testCases = [] } = {}) {
    const entry = this._adapterRegistry.get(adapterId);
    if (!entry || entry.state !== "trained") {
      return { ok: false, error: `adapterId "${adapterId}" is not in state "trained" (current: ${entry?.state ?? "unknown"})` };
    }

    const manifest = this.constructor.MANIFEST;
    const external = manifest?.external ?? {};
    const base     = this._base(manifest, external);

    let passed = false, score = 0, testCaseCount = testCases.length;
    try {
      const result = await this._validateLoRA(adapterId, testCases);
      passed        = result?.passed ?? false;
      score         = result?.score  ?? 0;
      testCaseCount = result?.testCaseCount ?? testCaseCount;
    } catch (_) {}

    Object.assign(entry, { state: "validated", passed, score });
    this._emit("sleeve:loraValidated", { ...base, adapterId, passed, score, testCaseCount });
    return { ok: true, adapterId, passed, score };
  },

  async proposeModelUpgrade({ adapterId, reason = null } = {}) {
    const entry = this._adapterRegistry.get(adapterId);
    if (!entry || entry.state !== "validated") {
      return { ok: false, error: `adapterId "${adapterId}" must be in state "validated" before proposing` };
    }
    if (!entry.passed) {
      return { ok: false, error: `adapterId "${adapterId}" did not pass validation — cannot propose` };
    }

    const manifest   = this.constructor.MANIFEST;
    const external   = manifest?.external ?? {};
    const proposalId = randomUUID();

    entry.state      = "proposed";
    entry.proposalId = proposalId;

    this._emit("sleeve:modelUpgradeProposed", {
      ...this._base(manifest, external),
      adapterId,
      proposalId,
      validationScore: entry.score,
      proposedReason:  reason ?? null
    });
    return { ok: true, proposalId };
  },

  // ── Amendment 4.4 subclass stubs ──────────────────────────────
  // Override in model sleeve subclasses (AiSleeve, QwenSleeve, PolicySleeve).
  // Non-model sleeves never call these; stubs are harmless defaults.

  async _trainLoRA(trainingData, epochs, rank, adapterId) {
    return { loss: null };
  },

  async _validateLoRA(adapterId, testCases) {
    return { passed: false, score: 0, testCaseCount: testCases.length };
  },

  async _loadAdapter(adapterId) {
    // No-op stub — model sleeves override to swap the active LoRA weights.
  }

};

module.exports = { MANIFEST, mixin: SleeveModelTrainingMixin };
