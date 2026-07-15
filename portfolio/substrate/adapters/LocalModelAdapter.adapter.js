// ──────────────────────────────────────────────────────────────────
// File:    LocalModelAdapter.js
// Version: 3.0.0
// Updated: 2026-07-13T00:00:00Z
// Changes: Phase 5 (oversized-file split) — decomposed the two
//          backends into LocalModelPythonBridge.adapter.js and
//          LocalModelLlamaCppBridge.adapter.js. This file is now a
//          thin orchestrator that dispatches to whichever bridge
//          matches opts.backend. Public API (generate, stream,
//          estimateTokens, calculateBudget) is unchanged.
// ──────────────────────────────────────────────────────────────────
// ============================================================
// LocalModelAdapter.js — SDOA v5 Adapter (NodeJS)
//
// Orchestrates two local-inference backends:
//
//   1. python-http  — LocalModelPythonBridge.adapter.js
//                     Selected when models.json entry has
//                     { "backend": "python-http" }.
//
//   2. llama-cpp    — LocalModelLlamaCppBridge.adapter.js (legacy)
//                     Selected when entry has a local "model_path".
//
// Both backends expose the same public API through this adapter:
//   generate(prompt, opts)  → string
//   stream(prompt, opts)    → string  (calls opts.onChunk per token)
//   estimateTokens(text)    → number
//   calculateBudget(opts)   → { promptTokens, responseTokens, headroom, fits }
// ============================================================

"use strict";

const LocalModelPythonBridge   = require("./LocalModelPythonBridge.adapter");
const LocalModelLlamaCppBridge = require("./LocalModelLlamaCppBridge.adapter");

class LocalModelAdapter {

    static MANIFEST = {
        id:           "LocalModelAdapter.adapter",
        type:         "adapter",
        layer:        3,
        runtime:      "NodeJS",
        version:      "3.0.0",
        capabilities: ["llm.local.generate", "llm.local.stream", "llm.local.tokenBudget"],
        dependencies: ["LocalModelPythonBridge.adapter", "LocalModelLlamaCppBridge.adapter"],
        docs: {
            description: "Local model inference orchestrator. Dispatches generate/stream calls to the python-http backend (LocalModelPythonBridge) or the legacy llama-cpp/GGUF backend (LocalModelLlamaCppBridge) based on opts.backend, and provides backend-agnostic token estimation and budget calculation.",
            author: "ProtoAI team"
        },
        last_modified: "2026-07-13T00:00:00Z"
    };

    constructor() {
        this._pythonBridge = new LocalModelPythonBridge();
        this._llamaBridge  = new LocalModelLlamaCppBridge();
    }

    // ──────────────────────────────────────────────────────
    //  Public API
    // ──────────────────────────────────────────────────────

    async generate(prompt, opts = {}) {
        const backend = opts.backend || (opts.modelPath ? "llama-cpp" : "python-http");
        if (backend === "python-http") return this._pythonBridge.generate(prompt, opts);
        return this._llamaBridge.generate(prompt, opts);
    }

    async stream(prompt, opts = {}) {
        const backend = opts.backend || (opts.modelPath ? "llama-cpp" : "python-http");
        if (backend === "python-http") return this._pythonBridge.stream(prompt, opts);
        return this._llamaBridge.stream(prompt, opts);
    }

    estimateTokens(text = "") {
        if (!text) return 0;
        const words   = (text.match(/\S+/g) || []).length;
        const symbols = (text.match(/[{}()[\];=<>\/\\+\-*|&^%$#@!,.?:\'"`~]/g) || []).length;
        return Math.ceil(words * 1.3 + symbols * 0.5);
    }

    calculateBudget({ contextWindow = 8192, systemPrompt = "", history = [], headroomPct = 0.15 } = {}) {
        const headroom       = Math.ceil(contextWindow * headroomPct);
        const systemTokens   = this.estimateTokens(systemPrompt);
        const historyTokens  = history.reduce((sum, m) => sum + this.estimateTokens(m.content || m.text || ""), 0);
        const usedTokens     = systemTokens + historyTokens + headroom;
        const responseTokens = Math.min(2048, Math.floor((contextWindow - usedTokens) * 0.4));
        const promptTokens   = contextWindow - usedTokens - responseTokens;
        return {
            promptTokens:   Math.max(0, promptTokens),
            responseTokens: Math.max(256, responseTokens),
            headroom,
            fits:           promptTokens > 256,
        };
    }
}

module.exports = LocalModelAdapter;
