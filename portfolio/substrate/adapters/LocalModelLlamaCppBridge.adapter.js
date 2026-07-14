// ──────────────────────────────────────────────────────────────────
// File:    LocalModelLlamaCppBridge.adapter.js
// Version: 1.0.0
// Updated: 2026-07-13T00:00:00Z
// Changes: Extracted from LocalModelAdapter.js (Phase 5 — oversized-file
//          split). Owns the legacy GGUF / node-llama-cpp backend.
// ──────────────────────────────────────────────────────────────────
// ============================================================
// LocalModelLlamaCppBridge.adapter.js — SDOA v5 Adapter (NodeJS)
//
// Legacy GGUF inference via node-llama-cpp. Selected when the
// caller passes opts.modelPath pointing at a local .gguf file.
//
// Public API (mirrors the subset of LocalModelAdapter's surface
// this backend implements):
//   generate(prompt, opts)  → string
//   stream(prompt, opts)    → string  (calls opts.onChunk per token)
// ============================================================

"use strict";

const fs        = require("fs");
const path      = require("path");
const Middleware = require("../services/Middleware.service");

// ── ESM compatibility for node-llama-cpp (legacy backend) ──
let _llamaCppMod = null;
async function _llamaCpp() {
    if (!_llamaCppMod) _llamaCppMod = await import("node-llama-cpp");
    return _llamaCppMod;
}

class LocalModelLlamaCppBridge {

    static MANIFEST = {
        id:           "LocalModelLlamaCppBridge.adapter",
        type:         "adapter",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.0.0",
        capabilities: ["llm.local.llamaCpp.generate", "llm.local.llamaCpp.stream"],
        dependencies: [],
        docs: {
            description: "Legacy GGUF inference backend via node-llama-cpp. Extracted from LocalModelAdapter.js as part of the Phase 5 oversized-file split.",
            author: "ProtoAI team"
        },
        last_modified: "2026-07-13T00:00:00Z"
    };

    constructor() {
        this._llama            = null;
        this._model            = null;
        this._ctx              = null;
        this._modelPath        = null;
        this._llamaReady       = false;
        this._llamaLoading     = null;
        this._LlamaChatSession = null;
    }

    async _ensureLlama(modelPath) {
        if (this._llamaReady && this._modelPath === modelPath) return;
        if (this._llamaLoading) return this._llamaLoading;

        this._llamaLoading = (async () => {
            const t0 = Date.now();
            Middleware.log(`[LocalModelLlamaCppBridge] Loading GGUF ${path.basename(modelPath)}…`);
            const { getLlama, LlamaChatSession } = await _llamaCpp();
            this._llama = await getLlama({ gpu: false });
            this._model = await this._llama.loadModel({ modelPath });
            this._ctx   = await this._model.createContext({ contextSize: 8192, batchSize: 512 });
            this._LlamaChatSession = LlamaChatSession;
            this._modelPath        = modelPath;
            this._llamaReady       = true;
            this._llamaLoading     = null;
            Middleware.log(`[LocalModelLlamaCppBridge] GGUF ready in ${Date.now() - t0}ms`);
        })();

        return this._llamaLoading;
    }

    // ──────────────────────────────────────────────────────
    //  Public API
    // ──────────────────────────────────────────────────────

    async generate(prompt, opts = {}) {
        const { modelPath, maxTokens = 512, temperature = 0.15, systemPrompt = "" } = opts;
        if (!modelPath)                throw new Error("[LocalModelLlamaCppBridge] opts.modelPath required for llama-cpp backend");
        if (!fs.existsSync(modelPath)) throw new Error(`[LocalModelLlamaCppBridge] Model not found: ${modelPath}`);

        await this._ensureLlama(modelPath);
        const seq     = this._ctx.getSequence();
        const session = new this._LlamaChatSession({ contextSequence: seq, systemPrompt });
        const t0 = Date.now();
        let result = "";
        try {
            result = await session.prompt(prompt, { maxTokens, temperature });
        } finally {
            try { seq.dispose(); } catch (_) {}
        }
        Middleware.log(`[LocalModelLlamaCppBridge] generate (llama-cpp) ${Date.now() - t0}ms`);
        return (result || "").trim();
    }

    async stream(prompt, opts = {}) {
        const { modelPath, maxTokens = 512, temperature = 0.15, systemPrompt = "", onChunk } = opts;
        if (!modelPath)                throw new Error("[LocalModelLlamaCppBridge] opts.modelPath required for llama-cpp backend");
        if (!fs.existsSync(modelPath)) throw new Error(`[LocalModelLlamaCppBridge] Model not found: ${modelPath}`);

        await this._ensureLlama(modelPath);
        const seq     = this._ctx.getSequence();
        const session = new this._LlamaChatSession({ contextSequence: seq, systemPrompt });
        let full = "";
        try {
            await session.prompt(prompt, {
                maxTokens, temperature,
                onTextChunk: (chunk) => {
                    full += chunk;
                    try { onChunk?.(chunk); } catch (_) {}
                },
            });
        } finally {
            try { seq.dispose(); } catch (_) {}
        }
        return full.trim();
    }
}

module.exports = LocalModelLlamaCppBridge;
