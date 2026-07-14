// ──────────────────────────────────────────────────────────────────
// File:    QwenSleeve.module.js
// Version: 1.0.0
// Updated: 2026-06-27T00:00:00Z
// Changes: Phase 2 Step 6 — Sleeve ratification (SDOA v5.4 §2.7).
//          Replaces LocalModelAdapter.js as the boundary sovereign for
//          the Python HTTP inference server (LocalLlmServer.engine.py).
//          external.system = "python-http-inference",
//          transport = "http+spawn".
// ──────────────────────────────────────────────────────────────────

"use strict";

const path = require("path");
const fs   = require("fs");
const os   = require("os");
const http = require("http");
const { spawn } = require("child_process");
const paths    = require("../access/env/paths");
const Middleware = require("../services/Middleware.service");

class QwenSleeve {

    static MANIFEST = {
        id:              "QwenSleeve.module",
        type:            "adapter",          // "sleeve" pending typedef extension
        layer:           3,
        runtime:         "NodeJS",
        version:         "1.0.1",
        last_modified:   "2026-07-13T00:00:00Z",
        operationalRole: "savant",
        requires:        ["ResponseFormatter.service", "PathResolver.service"],
        dependencies:    ["ResponseFormatter.service", "PathResolver.service"],
        capabilities:    ["local.generate", "local.stream", "local.tokenize", "local.budget"],
        lifecycle:       ["init", "run", "dispose"],

        external: {
            system:    "python-http-inference",
            transport: "http+spawn",
            path:      "auto",
            commands:  ["/generate", "/health"]
        },

        actions: {
            commands: {
                generate: {
                    description: "Generate text via the local Python inference server (spawns on first call).",
                    input:  { prompt: "string", opts: "object?" },
                    output: "string"
                },
                stream: {
                    description: "Stream text chunks from the local inference server.",
                    input:  { prompt: "string", opts: "object?" },
                    output: "string"
                },
                estimateTokens: {
                    description: "Estimate token count for a string.",
                    input:  { text: "string" },
                    output: "number"
                }
            },
            events:  {},
            accepts: {},
            slots:   {}
        },

        optimization: { priority: "readability", assertionSuite: "" },
        docs: {
            description: "Sleeve boundary module. Spawns LocalLlmServer.engine.py on demand and routes inference via HTTP. Normalises all output through ResponseFormatter. Never mutates SDOA source files.",
            author: "ProtoAI team",
            sdoa:   "5.4.0"
        }
    };

    constructor() {
        this._serverProc  = null;
        this._serverPort  = null;
        this._serverReady = false;
        this._serverStart = null;
        this._activeCount = 0;
    }

    // ── Lifecycle ─────────────────────────────────────────────────

    async init() {}
    async run()  { return { status: "ready" }; }
    async dispose() {
        if (this._serverProc) {
            try { this._serverProc.kill(); } catch (_) {}
            this._serverProc  = null;
            this._serverReady = false;
        }
    }

    // ── Public API ────────────────────────────────────────────────

    async generate(prompt, opts = {}) {
        if (this._activeCount >= 1) throw new Error("[QwenSleeve] Local model busy");
        this._activeCount++;
        try {
            await this._ensureServer(opts);
            return await this._httpGenerate(this._serverPort, {
                prompt,
                system_prompt:  opts.systemPrompt ?? "",
                max_new_tokens: opts.maxTokens    ?? 512,
                temperature:    opts.temperature  ?? 0.7,
            });
        } finally {
            this._activeCount--;
        }
    }

    async stream(prompt, opts = {}) {
        const text = await this.generate(prompt, opts);
        try { opts.onChunk?.(text); } catch (_) {}
        return text;
    }

    estimateTokens(text = "") {
        const words   = (text.match(/\S+/g) || []).length;
        const symbols = (text.match(/[{}()[\];=<>\/\\+\-*|&^%$#@!,.?:\'"`~]/g) || []).length;
        return Math.ceil(words * 1.3 + symbols * 0.5);
    }

    // ── Internal: server lifecycle ────────────────────────────────

    async _ensureServer(entry = {}) {
        if (this._serverReady) return;
        if (this._serverStart) return this._serverStart;
        this._serverStart = this._startServer(entry).finally(() => { this._serverStart = null; });
        return this._serverStart;
    }

    async _startServer(entry = {}) {
        const port   = entry.port || 17892;
        const python = this._findPython();
        const script = this._serverScriptPath();

        if (!python) throw new Error("[QwenSleeve] No Python executable found.");
        if (!script) throw new Error("[QwenSleeve] LocalLlmServer.engine.py not found.");

        const alive = await this._ping(port, 5000);
        if (alive?.ok) { this._serverPort = port; this._serverReady = true; return; }

        return new Promise((resolve, reject) => {
            const modelArg = entry.model || process.env.PROTOAI_MODEL || "Qwen/Qwen2.5-Coder-7B-Instruct";
            const proc = spawn(python, [script, "--port", String(port), "--model", modelArg, "--lazy"], {
                stdio: ["ignore", "pipe", "pipe"],
            });

            this._serverProc = proc;
            const t = setTimeout(() => reject(new Error("[QwenSleeve] Server did not signal readiness within 60s")), 60_000);

            proc.stdout.on("data", chunk => {
                if (chunk.toString().includes("QWEN_SERVER_READY")) {
                    clearTimeout(t);
                    this._serverPort  = port;
                    this._serverReady = true;
                    resolve();
                }
            });
            proc.stderr.on("data", chunk => Middleware.log(`[qwen] ${chunk.toString().trim()}`));
            proc.on("exit", () => { this._serverReady = false; this._serverProc = null; this._serverPort = null; });
            proc.on("error", err => { clearTimeout(t); reject(err); });
        });
    }

    _ping(port, timeoutMs = 2000) {
        return new Promise(resolve => {
            const req = http.get({ hostname: "127.0.0.1", port, path: "/health", timeout: timeoutMs }, res => {
                let body = "";
                res.on("data", d => body += d);
                res.on("end", () => { try { resolve(JSON.parse(body)); } catch (_) { resolve(null); } });
            });
            req.on("error", () => resolve(null));
            req.on("timeout", () => { req.destroy(); resolve(null); });
        });
    }

    _httpGenerate(port, payload, timeoutMs = 300_000) {
        return new Promise((resolve, reject) => {
            const body = JSON.stringify(payload);
            const req  = http.request({
                hostname: "127.0.0.1", port, path: "/generate", method: "POST",
                headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
                timeout: timeoutMs,
            }, res => {
                let data = "";
                res.on("data", d => data += d);
                res.on("end", () => {
                    try {
                        const p = JSON.parse(data);
                        if (p.error) reject(new Error(p.error)); else resolve(p.text || "");
                    } catch (e) { reject(new Error("Invalid JSON from inference server")); }
                });
            });
            req.on("error", reject);
            req.on("timeout", () => { req.destroy(); reject(new Error("[QwenSleeve] Request timed out")); });
            req.write(body);
            req.end();
        });
    }

    _findPython() {
        const appdata = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
        const venv    = path.join(appdata, "protoai", "ai_env", "Scripts", "python.exe");
        if (fs.existsSync(venv)) return venv;
        const embed   = path.join(paths.root, "python-embed", "python.exe");
        if (fs.existsSync(embed)) return embed;
        for (const name of ["python3", "python"]) {
            try { require("child_process").execSync(`${name} --version`, { stdio: "ignore" }); return name; } catch (_) {}
        }
        return null;
    }

    _serverScriptPath() {
        const candidates = [
            path.join(__dirname, "..", "engines", "LocalLlmServer.engine.py"),
            path.join(paths.root, "substrate", "engines", "LocalLlmServer.engine.py"),
        ];
        for (const c of candidates) { if (fs.existsSync(c)) return c; }
        return null;
    }
}

module.exports = QwenSleeve;
