// ──────────────────────────────────────────────────────────────────
// File:    LocalModelAdapter.js
// Version: 2.2.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure;
//          FIXED paths:
//            require("../env/paths") → require("../access/env/paths")
//            require("../../services/Middleware.service") → require("../services/Middleware.service")
// ──────────────────────────────────────────────────────────────────
// ============================================================
// LocalModelAdapter.js — SDOA v4 Adapter (NodeJS)
// version: 2.2.0
// Last modified: 2026-06-03 06:10 UTC
//
// Supports two backends:
//
//   1. python-http  — Spawns qwen_server.py inside the user's
//                     ai_env venv (or embedded Python), waits for
//                     QWEN_SERVER_READY:<port> on stdout, then
//                     routes all inference through HTTP.
//                     Selected when models.json entry has
//                     { "backend": "python-http" }.
//
//   2. llama-cpp    — Legacy GGUF inference via node-llama-cpp.
//                     Selected when entry has a local "model_path".
//
// Both backends expose the same public API:
//   generate(prompt, opts)  → string
//   stream(prompt, opts)    → string  (calls opts.onChunk per token)
//   estimateTokens(text)    → number
//   calculateBudget(opts)   → { promptTokens, responseTokens, headroom, fits }
// ============================================================

"use strict";

const path      = require("path");
const fs        = require("fs");
const os        = require("os");
const http      = require("http");
const { spawn } = require("child_process");
const paths     = require("../access/env/paths");
const Middleware = require("../services/Middleware.service");

// ── ESM compatibility for node-llama-cpp (legacy backend) ──
let _llamaCppMod = null;
async function _llamaCpp() {
    if (!_llamaCppMod) _llamaCppMod = await import("node-llama-cpp");
    return _llamaCppMod;
}


// ══════════════════════════════════════════════════════════
//  Python HTTP backend helpers
// ══════════════════════════════════════════════════════════

/**
 * Locate the Python executable to use for the AI environment.
 * Priority:
 *   1. %APPDATA%\protoai\ai_env\Scripts\python.exe  (set up by bootstrap)
 *   2. <resources>/python-embed/python.exe           (bundled embed)
 *   3. System python3 / python
 */
function _findPython() {
    const appdata  = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    const venvPy   = path.join(appdata, "protoai", "ai_env", "Scripts", "python.exe");
    if (fs.existsSync(venvPy)) return venvPy;

    const embedPy  = path.join(paths.root, "python-embed", "python.exe");
    if (fs.existsSync(embedPy)) return embedPy;

    const fallbacks = ["python3", "python"];
    for (const name of fallbacks) {
        try {
            require("child_process").execSync(`${name} --version`, { stdio: "ignore" });
            return name;
        } catch (_) {}
    }
    return null;
}

/**
 * Resolve the path to qwen_server.py / LocalLlmServer.engine.py in resources/server/engines/.
 */
function _serverScriptPath() {
    // qwen_server.py is a legacy variant — canonical engine is LocalLlmServer.engine.py
    const candidates = [
        path.join(__dirname, "..", "engines", "LocalLlmServer.engine.py"),
        path.join(paths.root, "substrate", "engines", "LocalLlmServer.engine.py"),
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return null;
}

/**
 * Ping the inference server. Returns parsed JSON when it responds to /health.
 */
function _ping(port, timeoutMs = 2000) {
    return new Promise((resolve) => {
        const req = http.get(
            { hostname: "127.0.0.1", port, path: "/health", timeout: timeoutMs },
            (res) => {
                let body = "";
                res.on("data", d => body += d);
                res.on("end", () => {
                    try { resolve(JSON.parse(body)); } catch (_) { resolve(null); }
                });
            }
        );
        req.on("error", () => resolve(null));
        req.on("timeout", () => { req.destroy(); resolve(null); });
    });
}

/**
 * POST /generate to the inference server and return the text.
 */
function _httpGenerate(port, payload, timeoutMs = 300_000) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(payload);
        const req  = http.request(
            {
                hostname: "127.0.0.1",
                port,
                path:     "/generate",
                method:   "POST",
                headers: {
                    "Content-Type":   "application/json",
                    "Content-Length": Buffer.byteLength(body),
                },
                timeout: timeoutMs,
            },
            (res) => {
                let data = "";
                res.on("data", d => data += d);
                res.on("end", () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.error) reject(new Error(parsed.error));
                        else resolve(parsed.text || "");
                    } catch (e) {
                        reject(new Error("Invalid JSON response from qwen_server"));
                    }
                });
            }
        );
        req.on("error", reject);
        req.on("timeout", () => { req.destroy(); reject(new Error("qwen_server request timed out")); });
        req.write(body);
        req.end();
    });
}


// ══════════════════════════════════════════════════════════
//  LocalModelAdapter class
// ══════════════════════════════════════════════════════════

class LocalModelAdapter {

    static MANIFEST = {
        id:      "LocalModelAdapter.adapter",
        type:    "adapter",
        "non-sdoa-compliant": true,
        docs: {
            description: "Exceeds the 500-line Layer 3 hard cap (local Qwen2.5/python-http and legacy GGUF/llama-cpp inference adapter). Flagged for the oversized-file split scheduled in a later remediation phase; not fixed here."
        }
    };

    constructor() {
        // ── python-http backend state ──
        this._serverProc  = null;
        this._serverPort  = null;
        this._serverReady = false;
        this._serverStart = null;
        this._activeGenerationsCount = 0;

        // ── llama-cpp backend state (legacy) ──
        this._llama            = null;
        this._model            = null;
        this._ctx              = null;
        this._modelPath        = null;
        this._llamaReady       = false;
        this._llamaLoading     = null;
        this._LlamaChatSession = null;
    }

    // ──────────────────────────────────────────────────────
    //  Python HTTP backend
    // ──────────────────────────────────────────────────────

    async _ensureServer(entry = {}) {
        if (this._serverReady) return;
        if (this._serverStart) return this._serverStart;
        this._serverStart = this._startServer(entry);
        try {
            await this._serverStart;
        } finally {
            // Always clear _serverStart so future calls can retry on failure
            this._serverStart = null;
        }
    }

    /**
     * Kill a zombie/orphan process holding a port.
     * Uses netstat to find the PID and taskkill to terminate it.
     */
    _killPortHolder(port) {
        try {
            const { execSync } = require("child_process");
            // Find PID listening on the port
            const out = execSync(`netstat -ano | findstr "LISTENING" | findstr ":${port}"`, { encoding: "utf8", timeout: 5000 });
            const lines = out.trim().split("\n");
            const pids = new Set();
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                const pid = parseInt(parts[parts.length - 1], 10);
                if (pid && pid !== process.pid) pids.add(pid);
            }
            for (const pid of pids) {
                Middleware.log(`[LocalModelAdapter] Killing orphan process PID ${pid} holding port ${port}`);
                try { execSync(`taskkill /PID ${pid} /F`, { timeout: 5000 }); } catch (_) {}
            }
            if (pids.size > 0) {
                const { execSync: execSyncSleep } = require("child_process");
                try { execSyncSleep("timeout /T 2 /NOBREAK >nul 2>&1", { timeout: 5000 }); } catch (_) {}
            }
            return pids.size > 0;
        } catch (_) {
            return false;
        }
    }

    async _startServer(entry = {}) {
        const port   = entry.port || 17892;
        Middleware.log(`[LocalModelAdapter] _startServer starting for port: ${port}`);
        const python = _findPython();
        const script = _serverScriptPath();

        Middleware.log(`[LocalModelAdapter] Python path: ${python}`);
        Middleware.log(`[LocalModelAdapter] Script path: ${script}`);

        if (!python) {
            Middleware.log("[LocalModelAdapter] ERROR: No Python executable found.");
            throw new Error("[LocalModelAdapter] No Python executable found. Run Setup Local AI first.");
        }
        if (!script) {
            Middleware.log("[LocalModelAdapter] ERROR: qwen_server.py script not found.");
            throw new Error("[LocalModelAdapter] qwen_server.py not found in resources.");
        }

        // Check if a healthy server is already running
        const alive = await _ping(port, 5000);
        if (alive?.ok) {
            Middleware.log(`[LocalModelAdapter] Python server already running on :${port}`);
            this._serverPort  = port;
            this._serverReady = true;
            return;
        }

        const portInUse = await new Promise((resolve) => {
            const net = require("net");
            const sock = new net.Socket();
            sock.setTimeout(2000);
            sock.once("connect", () => { sock.destroy(); resolve(true); });
            sock.once("error", () => resolve(false));
            sock.once("timeout", () => { sock.destroy(); resolve(false); });
            sock.connect(port, "127.0.0.1");
        });

        if (portInUse) {
            Middleware.log(`[LocalModelAdapter] Port ${port} occupied by zombie process — killing it`);
            this._killPortHolder(port);
            await new Promise(r => setTimeout(r, 1500));
        }

        Middleware.log(`[LocalModelAdapter] Spawning qwen_server.py on :${port} with ${python}`);

        return new Promise((resolve, reject) => {
            let modelArg = entry.model || process.env.PROTOAI_MODEL || "Qwen/Qwen2.5-Coder-7B-Instruct";
            if (!entry.model) {
                try {
                    const appdata = process.env.APPDATA || require("path").join(require("os").homedir(), "AppData", "Roaming");
                    const statusPath = require("path").join(appdata, "protoai", "provision_status.json");
                    if (fs.existsSync(statusPath)) {
                        const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
                        if (status.model) modelArg = status.model;
                    }
                } catch (_) {}
            }

            if (modelArg.toLowerCase().includes("omni")) {
                Middleware.log(`[LocalModelAdapter] Omni model "${modelArg}" is not compatible with AutoModelForCausalLM — substituting Qwen/Qwen2.5-Coder-7B-Instruct`);
                modelArg = "Qwen/Qwen2.5-Coder-7B-Instruct";
            }

            Middleware.log(`[LocalModelAdapter] Using model: ${modelArg}`);

            const proc = spawn(python, [script, "--port", String(port), "--model", modelArg, "--lazy"], {
                stdio: ["ignore", "pipe", "pipe"],
            });

            this._serverProc = proc;

            const startTimeout = setTimeout(() => {
                reject(new Error("[LocalModelAdapter] qwen_server.py did not signal readiness within 60s"));
            }, 60_000);

            proc.stdout.on("data", (chunk) => {
                const text = chunk.toString();
                Middleware.log(`[qwen_server] ${text.trim()}`);
                if (text.includes("QWEN_SERVER_READY")) {
                    clearTimeout(startTimeout);
                    this._serverPort  = port;
                    this._serverReady = true;
                    resolve();
                }
            });

            proc.stderr.on("data", (chunk) => {
                Middleware.log(`[qwen_server:err] ${chunk.toString().trim()}`);
            });

            proc.on("exit", (code, signal) => {
                Middleware.log(`[LocalModelAdapter] qwen_server exited (code=${code} signal=${signal})`);
                this._serverReady = false;
                this._serverProc  = null;
                this._serverPort  = null;
            });

            proc.on("error", (err) => {
                clearTimeout(startTimeout);
                reject(err);
            });
        });
    }

    async _generateViaHttp(prompt, opts = {}) {
        const { maxTokens = 512, temperature = 0.7, systemPrompt = "", port, model } = opts;
        await this._ensureServer({ port: port || this._serverPort || 17892, model });

        const startTime  = Date.now();
        const timeout    = 300_000;
        let   lastLogAt  = 0;

        while (Date.now() - startTime < timeout) {
            try {
                return await _httpGenerate(this._serverPort, {
                    prompt,
                    system_prompt:  systemPrompt,
                    max_new_tokens: maxTokens,
                    temperature,
                });
            } catch (err) {
                if (err.message.includes("Model is still loading") || err.message.includes("503") || err.message.includes("timed out")) {
                    const elapsed = Math.floor((Date.now() - startTime) / 1000);
                    if (elapsed - lastLogAt >= 30) {
                        Middleware.log(`[LocalModelAdapter] Model loading — waiting (${elapsed}s elapsed)…`);
                        lastLogAt = elapsed;
                    }
                    await new Promise(r => setTimeout(r, 3000));
                    continue;
                }
                if (err.code === "ECONNREFUSED" || (err.message || "").includes("ECONNREFUSED")) {
                    Middleware.log("[LocalModelAdapter] Server connection refused — marking as not ready for respawn");
                    this._serverReady = false;
                    this._serverProc  = null;
                    this._serverPort  = null;
                }
                if (
                    (err.message || "").includes("Model failed to load") ||
                    (err.message || "").includes("Unrecognized configuration") ||
                    (err.message || "").includes("not supported by the local text server")
                ) {
                    Middleware.log("[LocalModelAdapter] Model load error — killing server for clean respawn on next call");
                    this._serverReady = false;
                    if (this._serverProc) {
                        try { this._serverProc.kill(); } catch (_) {}
                        this._serverProc = null;
                    }
                    this._serverPort = null;
                }
                throw err;
            }
        }
        throw new Error("Local model failed to become ready within 300s");
    }

    // ──────────────────────────────────────────────────────
    //  llama-cpp backend (legacy GGUF)
    // ──────────────────────────────────────────────────────

    async _ensureLlama(modelPath) {
        if (this._llamaReady && this._modelPath === modelPath) return;
        if (this._llamaLoading) return this._llamaLoading;

        this._llamaLoading = (async () => {
            const t0 = Date.now();
            Middleware.log(`[LocalModelAdapter] Loading GGUF ${path.basename(modelPath)}…`);
            const { getLlama, LlamaChatSession } = await _llamaCpp();
            this._llama = await getLlama({ gpu: false });
            this._model = await this._llama.loadModel({ modelPath });
            this._ctx   = await this._model.createContext({ contextSize: 8192, batchSize: 512 });
            this._LlamaChatSession = LlamaChatSession;
            this._modelPath        = modelPath;
            this._llamaReady       = true;
            this._llamaLoading     = null;
            Middleware.log(`[LocalModelAdapter] GGUF ready in ${Date.now() - t0}ms`);
        })();

        return this._llamaLoading;
    }

    // ──────────────────────────────────────────────────────
    //  Public API
    // ──────────────────────────────────────────────────────

    async generate(prompt, opts = {}) {
        const backend = opts.backend || (opts.modelPath ? "llama-cpp" : "python-http");

        if (backend === "python-http") {
            if (this._activeGenerationsCount >= 1) {
                Middleware.log("[LocalModelAdapter] Local model is busy, skipping request to prevent timeout");
                throw new Error("Local model is busy");
            }
            this._activeGenerationsCount++;
            try {
                const t0  = Date.now();
                const out = await this._generateViaHttp(prompt, opts);
                Middleware.log(`[LocalModelAdapter] generate (http) ${Date.now() - t0}ms`);
                return out;
            } finally {
                this._activeGenerationsCount--;
            }
        }

        const { modelPath, maxTokens = 512, temperature = 0.15, systemPrompt = "" } = opts;
        if (!modelPath)                throw new Error("[LocalModelAdapter] opts.modelPath required for llama-cpp backend");
        if (!fs.existsSync(modelPath)) throw new Error(`[LocalModelAdapter] Model not found: ${modelPath}`);

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
        Middleware.log(`[LocalModelAdapter] generate (llama-cpp) ${Date.now() - t0}ms`);
        return (result || "").trim();
    }

    async stream(prompt, opts = {}) {
        const backend = opts.backend || (opts.modelPath ? "llama-cpp" : "python-http");

        if (backend === "python-http") {
            if (this._activeGenerationsCount >= 1) {
                Middleware.log("[LocalModelAdapter] Local model is busy, skipping request to prevent timeout");
                throw new Error("Local model is busy");
            }
            this._activeGenerationsCount++;
            try {
                const text = await this._generateViaHttp(prompt, opts);
                try { opts.onChunk?.(text); } catch (_) {}
                return text;
            } finally {
                this._activeGenerationsCount--;
            }
        }

        const { modelPath, maxTokens = 512, temperature = 0.15, systemPrompt = "", onChunk } = opts;
        if (!modelPath)                throw new Error("[LocalModelAdapter] opts.modelPath required for llama-cpp backend");
        if (!fs.existsSync(modelPath)) throw new Error(`[LocalModelAdapter] Model not found: ${modelPath}`);

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
