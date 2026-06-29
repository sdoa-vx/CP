// ──────────────────────────────────────────────────────────────────
// File:    OllamaSDOASleeve.module.js
// Version: 1.0.0
// Updated: 2026-06-27T00:00:00Z
// Changes: Phase 3 of the SDOA LoRA Fine-Tune Gameplan.
//          Sleeve boundary sovereign for the SDOA-fine-tuned Qwen2.5
//          model running in local Ollama (sdoa-qwen).
//          Extends SleeveBase. Transport: http. Ollama REST API.
//          Commands: generate, health.
// ──────────────────────────────────────────────────────────────────

"use strict";

const http = require("http");
const SleeveBase = require("./SleeveBase.module");

// Default Ollama endpoint — never hardcoded to a machine-absolute path.
// Override via env: SDOA_OLLAMA_HOST, SDOA_OLLAMA_PORT, SDOA_OLLAMA_MODEL
const OLLAMA_HOST    = process.env.SDOA_OLLAMA_HOST  || "127.0.0.1";
const OLLAMA_PORT    = parseInt(process.env.SDOA_OLLAMA_PORT  || "11434", 10);
const OLLAMA_MODEL   = process.env.SDOA_OLLAMA_MODEL || "sdoa-qwen";
const DEFAULT_TIMEOUT_MS = 120_000;

class OllamaSDOASleeve extends SleeveBase {

    static MANIFEST = {
        id:              "OllamaSDOASleeve.module",
        type:            "sleeve",
        layer:           3,
        runtime:         "NodeJS",
        version:         "1.0.0",
        operationalRole: "savant",
        requires:        ["ResponseFormatter.service", "PathResolver.service"],
        capabilities:    ["sdoa-qwen.generate", "sdoa-qwen.health"],
        lifecycle:       ["init", "run", "dispose"],

        external: {
            system:    "ollama-sdoa-qwen",
            transport: "http",
            path:      "auto",
            commands:  ["generate", "health"]
        },

        optimization: { priority: "readability", assertionSuite: "" },
        last_modified: "2026-06-27T00:00:00Z",
        docs: {
            description:
                "Sleeve boundary sovereign for the SDOA-fine-tuned Qwen2.5 model " +
                "running in local Ollama (sdoa-qwen). Routes generate and health " +
                "commands through the Ollama HTTP REST API. All output normalized " +
                "through ResponseFormatter.",
            author: "ProtoAI team",
            sdoa:   "5.4.0"
        }
    };

    // ── Construction ──────────────────────────────────────────────

    constructor() {
        super();
        this._host    = OLLAMA_HOST;
        this._port    = OLLAMA_PORT;
        this._model   = OLLAMA_MODEL;
        this._timeout = DEFAULT_TIMEOUT_MS;
    }

    // ── SleeveBase overrides ──────────────────────────────────────

    async _healthCheck() {
        const result = await this._httpGet("/api/tags", 5_000);
        if (!result) {
            throw new Error(
                `[OllamaSDOASleeve] Ollama not reachable at ` +
                `${this._host}:${this._port}. Is Ollama running?`
            );
        }

        // Check that the sdoa-qwen model is registered
        const models = result?.models ?? [];
        const found  = models.some(m => m.name === this._model || m.name.startsWith(this._model + ":"));
        if (!found) {
            const names = models.map(m => m.name).join(", ") || "(none)";
            throw new Error(
                `[OllamaSDOASleeve] Model "${this._model}" not found in Ollama. ` +
                `Available: ${names}. ` +
                `Run: ollama create ${this._model} -f ollama/Modelfile.sdoa`
            );
        }
    }

    // Dispatch to the correct handler by command name
    async _callExternal(command, payload) {
        if (command === "generate") return this._generate(payload);
        if (command === "health")   return this._ollamaHealth();
        throw new Error(`[OllamaSDOASleeve] Unknown command: ${command}`);
    }

    async _teardown() {
        // Stateless HTTP sleeve — nothing to close
    }

    // ── Command implementations ───────────────────────────────────

    async _generate(payload = {}) {
        const prompt       = payload.prompt       ?? "";
        const systemPrompt = payload.systemPrompt ?? "";
        const maxTokens    = payload.maxTokens    ?? 1024;
        const temperature  = payload.temperature  ?? 0.25;

        if (!prompt) {
            return { ok: false, error: "[OllamaSDOASleeve] generate: 'prompt' is required" };
        }

        const body = {
            model:  this._model,
            prompt: prompt,
            stream: false,
            options: {
                num_predict:    maxTokens,
                temperature:    temperature,
                top_p:          0.9,
                repeat_penalty: 1.1,
            },
        };

        // Inject caller-supplied system prompt on top of the constitution baked into the model
        if (systemPrompt) {
            body.system = systemPrompt;
        }

        const raw = await this._httpPost("/api/generate", body, this._timeout);

        if (!raw) {
            return { ok: false, error: "[OllamaSDOASleeve] No response from Ollama /api/generate" };
        }
        if (raw.error) {
            return { ok: false, error: `[OllamaSDOASleeve] Ollama error: ${raw.error}` };
        }

        return { ok: true, data: { text: raw.response ?? "", model: raw.model ?? this._model } };
    }

    async _ollamaHealth() {
        const result = await this._httpGet("/api/tags", 5_000);
        if (!result) {
            return { ok: false, error: "Ollama unreachable" };
        }
        const models = (result.models ?? []).map(m => m.name);
        const ready  = models.some(n => n === this._model || n.startsWith(this._model + ":"));
        return {
            ok:   ready,
            data: {
                ollama:    "reachable",
                model:     this._model,
                ready,
                available: models,
            },
            ...(ready ? {} : { error: `Model "${this._model}" not loaded in Ollama` }),
        };
    }

    // ── HTTP helpers ──────────────────────────────────────────────

    _httpGet(path, timeoutMs = 5_000) {
        return new Promise(resolve => {
            const req = http.get(
                { hostname: this._host, port: this._port, path, timeout: timeoutMs },
                res => {
                    let body = "";
                    res.on("data", d => { body += d; });
                    res.on("end", () => {
                        try { resolve(JSON.parse(body)); } catch (_) { resolve(null); }
                    });
                }
            );
            req.on("error",   () => resolve(null));
            req.on("timeout", () => { req.destroy(); resolve(null); });
        });
    }

    _httpPost(path, payload, timeoutMs = DEFAULT_TIMEOUT_MS) {
        return new Promise((resolve, reject) => {
            const body = JSON.stringify(payload);
            const req  = http.request(
                {
                    hostname:  this._host,
                    port:      this._port,
                    path,
                    method:    "POST",
                    headers: {
                        "Content-Type":   "application/json",
                        "Content-Length": Buffer.byteLength(body),
                    },
                    timeout: timeoutMs,
                },
                res => {
                    let data = "";
                    res.on("data", d => { data += d; });
                    res.on("end", () => {
                        try { resolve(JSON.parse(data)); }
                        catch (_) { reject(new Error("Invalid JSON from Ollama")); }
                    });
                }
            );
            req.on("error",   reject);
            req.on("timeout", () => {
                req.destroy();
                reject(new Error(`[OllamaSDOASleeve] Request timed out after ${timeoutMs}ms`));
            });
            req.write(body);
            req.end();
        });
    }
}

module.exports = OllamaSDOASleeve;
