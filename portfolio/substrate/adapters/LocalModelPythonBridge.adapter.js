// ──────────────────────────────────────────────────────────────────
// File:    LocalModelPythonBridge.adapter.js
// Version: 1.0.0
// Updated: 2026-07-13T00:00:00Z
// Changes: Extracted from LocalModelAdapter.js (Phase 5 — oversized-file
//          split). Owns the python-http backend: spawning and talking to
//          qwen_server.py inside the ai_env venv.
// ──────────────────────────────────────────────────────────────────
// ============================================================
// LocalModelPythonBridge.adapter.js — SDOA v5 Adapter (NodeJS)
//
// Python HTTP backend for local inference. Spawns qwen_server.py
// inside the user's ai_env venv (or embedded Python), waits for
// QWEN_SERVER_READY:<port> on stdout, then routes all inference
// through HTTP.
//
// Public API (mirrors the subset of LocalModelAdapter's surface
// this backend implements):
//   generate(prompt, opts)  → string
//   stream(prompt, opts)    → string  (calls opts.onChunk per token)
// ============================================================

"use strict";

const path      = require("path");
const fs        = require("fs");
const os        = require("os");
const http      = require("http");
const { spawn } = require("child_process");
const paths     = require("../access/env/paths");
const Middleware = require("../services/Middleware.service");

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
//  LocalModelPythonBridge class
// ══════════════════════════════════════════════════════════

class LocalModelPythonBridge {

    static MANIFEST = {
        id:           "LocalModelPythonBridge.adapter",
        type:         "adapter",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.0.0",
        capabilities: ["llm.local.pythonHttp.generate", "llm.local.pythonHttp.stream", "llm.local.pythonHttp.serverLifecycle"],
        dependencies: [],
        docs: {
            description: "Python-http backend for local model inference — spawns and talks to qwen_server.py over HTTP. Extracted from LocalModelAdapter.js as part of the Phase 5 oversized-file split.",
            author: "ProtoAI team"
        },
        last_modified: "2026-07-13T00:00:00Z"
    };

    constructor() {
        this._serverProc  = null;
        this._serverPort  = null;
        this._serverReady = false;
        this._serverStart = null;
        this._activeGenerationsCount = 0;
    }

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
                Middleware.log(`[LocalModelPythonBridge] Killing orphan process PID ${pid} holding port ${port}`);
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
        Middleware.log(`[LocalModelPythonBridge] _startServer starting for port: ${port}`);
        const python = _findPython();
        const script = _serverScriptPath();

        Middleware.log(`[LocalModelPythonBridge] Python path: ${python}`);
        Middleware.log(`[LocalModelPythonBridge] Script path: ${script}`);

        if (!python) {
            Middleware.log("[LocalModelPythonBridge] ERROR: No Python executable found.");
            throw new Error("[LocalModelPythonBridge] No Python executable found. Run Setup Local AI first.");
        }
        if (!script) {
            Middleware.log("[LocalModelPythonBridge] ERROR: qwen_server.py script not found.");
            throw new Error("[LocalModelPythonBridge] qwen_server.py not found in resources.");
        }

        // Check if a healthy server is already running
        const alive = await _ping(port, 5000);
        if (alive?.ok) {
            Middleware.log(`[LocalModelPythonBridge] Python server already running on :${port}`);
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
            Middleware.log(`[LocalModelPythonBridge] Port ${port} occupied by zombie process — killing it`);
            this._killPortHolder(port);
            await new Promise(r => setTimeout(r, 1500));
        }

        Middleware.log(`[LocalModelPythonBridge] Spawning qwen_server.py on :${port} with ${python}`);

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
                Middleware.log(`[LocalModelPythonBridge] Omni model "${modelArg}" is not compatible with AutoModelForCausalLM — substituting Qwen/Qwen2.5-Coder-7B-Instruct`);
                modelArg = "Qwen/Qwen2.5-Coder-7B-Instruct";
            }

            Middleware.log(`[LocalModelPythonBridge] Using model: ${modelArg}`);

            const proc = spawn(python, [script, "--port", String(port), "--model", modelArg, "--lazy"], {
                stdio: ["ignore", "pipe", "pipe"],
            });

            this._serverProc = proc;

            const startTimeout = setTimeout(() => {
                reject(new Error("[LocalModelPythonBridge] qwen_server.py did not signal readiness within 60s"));
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
                Middleware.log(`[LocalModelPythonBridge] qwen_server exited (code=${code} signal=${signal})`);
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
                        Middleware.log(`[LocalModelPythonBridge] Model loading — waiting (${elapsed}s elapsed)…`);
                        lastLogAt = elapsed;
                    }
                    await new Promise(r => setTimeout(r, 3000));
                    continue;
                }
                if (err.code === "ECONNREFUSED" || (err.message || "").includes("ECONNREFUSED")) {
                    Middleware.log("[LocalModelPythonBridge] Server connection refused — marking as not ready for respawn");
                    this._serverReady = false;
                    this._serverProc  = null;
                    this._serverPort  = null;
                }
                if (
                    (err.message || "").includes("Model failed to load") ||
                    (err.message || "").includes("Unrecognized configuration") ||
                    (err.message || "").includes("not supported by the local text server")
                ) {
                    Middleware.log("[LocalModelPythonBridge] Model load error — killing server for clean respawn on next call");
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
    //  Public API
    // ──────────────────────────────────────────────────────

    async generate(prompt, opts = {}) {
        if (this._activeGenerationsCount >= 1) {
            Middleware.log("[LocalModelPythonBridge] Local model is busy, skipping request to prevent timeout");
            throw new Error("Local model is busy");
        }
        this._activeGenerationsCount++;
        try {
            const t0  = Date.now();
            const out = await this._generateViaHttp(prompt, opts);
            Middleware.log(`[LocalModelPythonBridge] generate (http) ${Date.now() - t0}ms`);
            return out;
        } finally {
            this._activeGenerationsCount--;
        }
    }

    async stream(prompt, opts = {}) {
        if (this._activeGenerationsCount >= 1) {
            Middleware.log("[LocalModelPythonBridge] Local model is busy, skipping request to prevent timeout");
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
}

module.exports = LocalModelPythonBridge;
