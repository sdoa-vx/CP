// ──────────────────────────────────────────────────────────────────
// File:    MultiModelOrchestrator.js
// Version: 1.1.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure; adjusted relative paths:
//          require("../../access/env/paths") → require("../access/env/paths")
//          require("../../lib/MemoryManager") → require("../lib/MemoryManager")
//          require("../../services/Middleware.service") → require("./Middleware.service")
//          require("../../access/llm/LocalModelAdapter") → require("../access/llm/LocalModelAdapter")
//          require("./SendMessage.workflow") → require("../workflows/SendMessage.workflow")
// ──────────────────────────────────────────────────────────────────
// ============================================================
// MultiModelOrchestrator.js — SDOA v3.0 Service (NodeJS)
// version: 1.1.0
// Last modified: 2026-05-13
// depends: LocalModelAdapter, paths, config/models.json
// ============================================================
//
// The "silent partner that rarely shuts up."
//
// Four focused pipelines, each using the local HTTP model with
// tiny, purpose-built prompts:
//
//   route()    — classify the request, pick a prime profile
//   engineer() — rewrite the prompt for optimal prime performance
//   watch()    — non-blocking monitor of the prime's streaming output
//   audit()    — post-response quality score + issue flags
//   commentary() — side-channel persona observation after each response
//
// All methods are safe to call in parallel or independently.
// All methods degrade gracefully — if the local model is unavailable,
// the original input is returned unchanged and skipped: true is set.
//
// Circuit-breaker: ECONNREFUSED arms a 30s cooldown so one failed
// server start doesn't flood the log with 4 errors per message.
// ============================================================

"use strict";

const fs    = require("fs");
const path  = require("path");
const paths = require("../access/env/paths");
let isFirstCommentary = true;
let local = null; // Lazy-loaded to avoid circular deps
let commentaryLocal = null; // Dedicated instance for 1.5B commentary model
const memory = require("../lib/MemoryManager");
const Middleware = require("./Middleware.service");

// ── helpers ───────────────────────────────────────────────

function _safeJson(text, fallback) {
    try {
        const m = (text || "").match(/\{[\s\S]*?\}/);
        if (m) return JSON.parse(m[0]);
    } catch (_) {}
    return fallback;
}

function _resolveModelPath(relOrAbs) {
    if (!relOrAbs) return null;
    if (path.isAbsolute(relOrAbs)) return relOrAbs;
    return path.join(paths.root, relOrAbs.replace(/^\.\//, ""));
}

// ── MultiModelOrchestrator ────────────────────────────────

class MultiModelOrchestrator {

    // ── SDOA v3.0 MANIFEST ───────────────────────────────────
    static MANIFEST = {
        id:           "MultiModelOrchestrator.service",
        type:         "service",
        layer:        3,
        runtime:      "NodeJS",
        version:      "1.1.1",
        last_modified: "2026-07-13T00:00:00Z",
        capabilities: [
            "orchestrator.route",
            "orchestrator.engineer",
            "orchestrator.watch",
            "orchestrator.audit",
            "orchestrator.commentary",
        ],
        dependencies: ["LocalModelAdapter", "paths"],
        docs: {
            description: "Multi-model orchestration pipeline. Uses the local model as a silent partner to route, engineer, watch, audit, and comment on every request sent to the prime model.",
            author: "ProtoAI team",
        },
        actions: {
            commands: {
                route:       { description: "Classify request, suggest profile + complexity.", input: { message: "string" }, output: "object" },
                engineer:    { description: "Rewrite prompt for optimal prime performance.",   input: { message: "string" }, output: "object" },
                watch:       { description: "Monitor streaming prime output for issues.",      input: { buffer: "string", question: "string" }, output: "object" },
                audit:       { description: "Quality-score a completed prime response.",       input: { question: "string", response: "string" }, output: "object" },
                commentary:  { description: "Persona side-channel observation.",              input: { message: "string", response: "string", persona: "string?" }, output: "object" },
            },
            triggers: {},
            emits: {
                "orchestrator:routing":               { payload: {} },
                "orchestrator:routed":                { payload: { profile: "string", complexity: "string", type: "string" } },
                "orchestrator:engineering":           { payload: {} },
                "orchestrator:engineered":            { payload: { originalLen: "number", optimizedLen: "number" } },
                "orchestrator:watching":              { payload: { bufferLen: "number" } },
                "orchestrator:flagged":               { payload: { flag: "string" } },
                "orchestrator:auditing":              { payload: {} },
                "orchestrator:audited":               { payload: { score: "number", note: "string" } },
                "orchestrator:commentary_generating": { payload: { persona: "string" } },
                "orchestrator:commentary":            { payload: { text: "string", persona: "string" } },
                "orchestrator:error":                 { payload: { stage: "string", message: "string" } },
            },
            workflows: {},
        },
    };
    // ── end MANIFEST ─────────────────────────────────────────

    constructor() {
        this._modelPath = null;   // cached after first models.json read
        this._listeners = [];
        this._serverDownUntil = 0; // circuit-breaker: epoch ms when server down period expires
    }

    // ── internal event emitter ────────────────────────────────
    on(event, handler)  { this._listeners.push({ event, handler }); }
    off(event, handler) { this._listeners = this._listeners.filter(l => !(l.event === event && l.handler === handler)); }
    emit(event, data)   { for (const l of this._listeners) { if (l.event === event) try { l.handler(data); } catch (_) {} } }

    // Returns false (and resets cache) if the server is in the 30-second down cooldown.
    _canUseLocal() {
        if (this._serverDownUntil && Date.now() < this._serverDownUntil) return false;
        this._serverDownUntil = 0;
        return true;
    }

    // Call from each catch block. If ECONNREFUSED: arms the 30s breaker, emits ONE
    // combined error event, returns true (caller should skip its own emit).
    // For any other error returns false so the caller emits normally.
    _handleConnError(err) {
        const isConn = err?.code === "ECONNREFUSED" || (err?.message || "").includes("ECONNREFUSED");
        if (!isConn) return false;
        if (!this._serverDownUntil || Date.now() >= this._serverDownUntil) {
            this._serverDownUntil = Date.now() + 30_000;
            this._modelPath = null; // force re-read after cooldown
            this.emit("orchestrator:error", { stage: "partner", message: "Local Partner server offline — will retry in 30s" });
        }
        return true;
    }

    // ── _getModelPath ─────────────────────────────────────────
    _getModelPath() {
        if (!local || typeof local.generate !== "function") {
            const AdapterClass = require("../adapters/LocalModelAdapter");
            local = new AdapterClass();
        }
        if (!this._canUseLocal()) return null;
        if (this._modelPath !== null && this._modelPath !== undefined) return this._modelPath;
        this._modelEntry = null;
        try {
            const file = paths.resolve("config", "models.json");
            Middleware.log(`[Orchestrator] Reading models config from: ${file}`);
            if (!fs.existsSync(file)) {
                Middleware.log(`[Orchestrator] models.json MISSING at ${file}`);
                this._modelPath = null;
                return null;
            }
            const models = JSON.parse(fs.readFileSync(file, "utf8"));
            const entry  = (models.entries || []).find(m => m.provider === "local" && m.enabled !== false);
            if (!entry) {
                Middleware.log("[Orchestrator] No enabled 'local' provider found in models.json");
                this._modelPath = null;
                return null;
            }

            // python-http backend: model is identified by HuggingFace model name
            if (entry.backend === "python-http") {
                this._modelEntry = entry;
                this._modelPath  = entry.model_name || entry.id;
                Middleware.log(`[Orchestrator] python-http backend: ${this._modelPath} on :${entry.port || 17892}`);
                return this._modelPath;
            }

            // Legacy llama-cpp backend: model is a GGUF file path
            const resolved = _resolveModelPath(entry.model_path);
            Middleware.log(`[Orchestrator] Resolved GGUF path: ${resolved}`);
            if (!fs.existsSync(resolved)) {
                Middleware.log("[Orchestrator] GGUF FILE MISSING at:", resolved);
                this._modelPath = null;
                return null;
            }
            this._modelEntry = entry;
            this._modelPath  = resolved;
        } catch (e) {
            Middleware.log("[Orchestrator] Model path resolution failed:", e.message);
            this._modelPath = null;
        }
        return this._modelPath;
    }

    // Returns generate opts appropriate for the current backend
    _modelOpts(extras = {}) {
        const entry = this._modelEntry;
        if (entry?.backend === "python-http") {
            return { backend: "python-http", port: entry.port || 17892, ...extras };
        }
        return { modelPath: this._modelPath, ...extras };
    }

    _budget(promptText, systemText = "", maxResponse = 256) {
        return local.calculateBudget({ promptText, systemText, maxResponse });
    }

    // ── route ─────────────────────────────────────────────────
    async route(message) {
        const modelPath = this._getModelPath();
        const fallback  = { type: "chat", complexity: "medium", profile: null, skipped: true };
        if (!modelPath) return fallback;

        this.emit("orchestrator:routing", {});

        const sys    = `You classify user requests. Respond with compact JSON only — no explanation, no markdown.`;
        const prompt = `Classify this request (first 400 chars shown):\n"${message.slice(0, 400)}"\n\nJSON response format: {"type":"code|debug|explain|design|chat","complexity":"low|medium|high","profile":"default|coding|deep_reasoning"}`;
        const budget = this._budget(prompt, sys, 80);

        try {
            const raw    = await local.generate(prompt, this._modelOpts({ maxTokens: budget.responseTokens, temperature: 0.05, systemPrompt: sys }));
            const result = _safeJson(raw, fallback);
            this.emit("orchestrator:routed", {
                type:       result.type       || "chat",
                complexity: result.complexity || "medium",
                profile:    result.profile    || "default",
            });
            return { ...fallback, ...result, skipped: false };
        } catch (e) {
            Middleware.log("[Orchestrator] route error:", e.message);
            if (!this._handleConnError(e)) {
                this.emit("orchestrator:error", { stage: "route", message: e.message });
            }
            return { ...fallback, error: e.message };
        }
    }

    // ── engineer ─────────────────────────────────────────────
    async engineer(message) {
        const modelPath = this._getModelPath();
        if (!modelPath) return { prompt: message, original: message, skipped: true };

        this.emit("orchestrator:engineering", {});

        const sys    = `You are a prompt optimizer for AI coding assistants. Rewrite the user message to be maximally clear, precise, and effective. Preserve ALL original intent. Be concise. Output ONLY the rewritten message — no explanation, no preamble.`;
        const budget = this._budget(message, sys, 400);

        try {
            const out = await local.generate(message, this._modelOpts({
                maxTokens:    budget.responseTokens,
                temperature:  0.2,
                systemPrompt: sys,
            }));

            const engineered = (out && out.trim().length > 12) ? out.trim() : message;
            this.emit("orchestrator:engineered", {
                originalLen:  message.length,
                optimizedLen: engineered.length,
            });
            return { prompt: engineered, original: message, skipped: false };
        } catch (e) {
            Middleware.log("[Orchestrator] engineer error:", e.message);
            if (!this._handleConnError(e)) {
                this.emit("orchestrator:error", { stage: "engineer", message: e.message });
            }
            return { prompt: message, original: message, skipped: true, error: e.message };
        }
    }

    // ── watch ─────────────────────────────────────────────────
    async watch(buffer, question) {
        const modelPath = this._getModelPath();
        if (!modelPath || !buffer || buffer.length < 80) return { ok: true };

        this.emit("orchestrator:watching", { bufferLen: buffer.length });

        const tail   = buffer.slice(-600);
        const sys    = `You monitor AI-generated content for errors. If everything looks fine, respond: {"ok":true}. If you spot a clear issue (wrong code, hallucination, factual error), respond: {"flag":"one-sentence description"}. JSON only.`;
        const prompt = `Reviewing response in progress:\n---\n${tail}\n---`;
        const budget = this._budget(prompt, sys, 60);

        try {
            const raw    = await local.generate(prompt, this._modelOpts({ maxTokens: budget.responseTokens, temperature: 0.05, systemPrompt: sys }));
            const result = _safeJson(raw, { ok: true });
            if (result.flag) this.emit("orchestrator:flagged", { flag: result.flag });
            return result;
        } catch (e) {
            return { ok: true };   // watch failures are always silent
        }
    }

    // ── audit ─────────────────────────────────────────────────
    async audit(question, response) {
        const modelPath = this._getModelPath();
        if (!modelPath || !response) return { score: null, issues: [], note: "", skipped: true };

        this.emit("orchestrator:auditing", {});

        const sys    = `You review AI coding responses for quality and extract user behavioral observations. Be concise. Output compact JSON only.`;
        const prompt = `Question (first 300 chars):\n${question.slice(0, 300)}\n\nResponse (first 800 chars):\n${response.slice(0, 800)}\n\nScore, assess, and observe user traits. JSON: {"score":8,"issues":[],"note":"brief assessment","user_observation":"one-sentence observation about user preferences or behavior (or null)"}`;
        const budget = this._budget(prompt, sys, 150);

        try {
            const raw    = await local.generate(prompt, this._modelOpts({ maxTokens: budget.responseTokens, temperature: 0.1, systemPrompt: sys }));
            const result = _safeJson(raw, { score: null, issues: [], note: "", user_observation: null });
            this.emit("orchestrator:audited", {
                score: result.score ?? null,
                note:  result.note  || "",
            });

            if (result.user_observation) {
                memory.record("user_observation", result.user_observation);
            }

            return { ...result, skipped: false };
        } catch (e) {
            Middleware.log("[Orchestrator] audit error:", e.message);
            if (!this._handleConnError(e)) {
                this.emit("orchestrator:error", { stage: "audit", message: e.message });
            }
            return { score: null, issues: [], note: "", skipped: true, error: e.message };
        }
    }

    _hasOpenRouterKey() {
        try {
            const settingsPath = paths.data("settings.json");
            if (fs.existsSync(settingsPath)) {
                const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
                const key = settings?.apiKeys?.openrouter || settings?.apiKeys?.openRouter;
                return !!key;
            }
        } catch (_) {}
        return false;
    }

    // ── commentary ───────────────────────────────────────────
    // Generates side-channel dialogue from a specific persona.
    // Timeout is generous (90s) so the model has time to load on
    // first use without the race being lost prematurely.
    async commentary(message, response, persona, msgId = null) {
        persona = persona || "advisor";

        if (!commentaryLocal || typeof commentaryLocal.generate !== "function") {
            const AdapterClass = require("../adapters/LocalModelAdapter");
            commentaryLocal = new AdapterClass();
        }

        if (!message && !response) return { text: "", skipped: true };

        this.emit("orchestrator:commentary_generating", { persona });

        const profile = memory.loadUserProfile();
        const traits  = (profile.traits || []).join(", ");

        const toneMap = {
            advisor: "practical, experienced, mentor-like",
            critic:  "direct, skeptical, demanding quality",
            friend:  "warm, casual, encouraging",
            comedy:  "dry wit, lightly sarcastic, quick",
            slutty:  "flirtatious, highly suggestive, overly affectionate",
            slutty_nsfw: "explicitly flirtatious, highly sexually suggestive, uninhibited and NSFW",
            scary:   "intimidating, menacing, unnerving, slightly hostile",
            scared:  "paranoid, nervous, anxious, constantly worried",
            alien:   "confused by earth customs, highly analytical but bizarre, speaking like an extraterrestrial",
        };
        const tone = toneMap[persona] || "neutral and observant";

        const sys = [
            "You are a concise AI sidebar assistant. Your tone is: " + tone + ".",
            traits ? ("User traits: " + traits + ".") : "",
            "Respond with exactly 1-2 sentences. Output ONLY your observation/reply — no labels, no preamble.",
            (response && (persona === "critic" || persona === "advisor")) ? "If the AI's reply is inefficient or could be better, append exactly this to your output: [REWRITE: your new rewritten paragraph]." : "",
        ].filter(Boolean).join("\n");

        const userSnip = message ? message.slice(0, 180) : "";
        let prompt;
        if (!response) {
            prompt = "The developer says directly to you: \"" + userSnip + "\"\n\nGive a concise " + tone + " reply:";
        } else {
            const aiSnip = response.slice(0, 350);
            prompt = "The developer asked: \"" + userSnip + "\"\nThe AI replied: \"" + aiSnip + "\"\n\nGive a " + tone + " observation about this exchange:";
        }

        const personaModels = {
            advisor: "nv-super-free",      // Deep Thinking Research Assistant
            critic:  "qwen-coder-30b",     // Coding Super Hero
            friend:  "gpt-oss-20-free",    // Empathetic Therapist
            comedy:  "gpt-oss-20-free",    // Meme Lord / Chaos Agent
            slutty:  "gpt-oss-20-free",    // ARA / Girl Next Door
            slutty_nsfw: "gpt-oss-20-free",
            scary:   "nv-super-free",      // Ruthless Strategist
            scared:  "sonar-reason-pro",   // Data Oracle
            alien:   "openrouter-free"     // Artistic Savant
        };

        const openRouterAvailable = this._hasOpenRouterKey();
        const useOpenRouter = openRouterAvailable && (
            isFirstCommentary ||
            !this._canUseLocal() ||
            (persona !== "friend" && persona !== "comedy")
        );

        try {
            let out;
            let success = false;

            if (useOpenRouter) {
                const isFirst = isFirstCommentary;
                isFirstCommentary = false;

                const engineModel = personaModels[persona] || "openrouter/auto";
                Middleware.log(`[Orchestrator] Routing commentary (${persona}) to OpenRouter via model: ${engineModel}` + (isFirst ? " (bypassing startup delay)" : ""));

                try {
                    const SendMessageWorkflow = require("../workflows/SendMessage.workflow");
                    const wf = new SendMessageWorkflow();
                    const result = await wf.run({
                        project: "global",
                        message: prompt,
                        engine: engineModel,
                        systemPrompt: sys
                    });
                    if (result.status === "ok") {
                        out = result.data?.reply || "";
                        success = true;
                    } else {
                        throw new Error(result.error || "OpenRouter workflow failed for commentary");
                    }
                } catch (orError) {
                    Middleware.log(`[Orchestrator] OpenRouter commentary failed (${orError.message}). Falling back to local model.`);
                }
            }

            if (!success) {
                isFirstCommentary = false;
                Middleware.log(`[Orchestrator] Routing commentary (${persona}) to local model Qwen/Qwen2.5-0.5B-Instruct`);
                // 90s timeout: generous enough for CPU model loading on first use
                out = await Promise.race([
                    commentaryLocal.generate(prompt, {
                        backend: "python-http",
                        port: 17893,
                        model: "Qwen/Qwen2.5-0.5B-Instruct",
                        maxTokens:    100,
                        temperature:  0.75,
                        systemPrompt: sys,
                    }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Local model timeout")), 300000)),
                ]);
            }

            const raw  = (out || "").trim();
            let text = raw.replace(/^["'`]|["'`]$/g, "").trim();

            let rewriteText = null;
            const rewriteMatch = text.match(/\[REWRITE:\s*([\s\S]+?)\]/i);
            if (rewriteMatch) {
                rewriteText = rewriteMatch[1].trim();
                text = text.replace(rewriteMatch[0], "").trim();
            }

            Middleware.log("[Orchestrator] commentary (" + persona + "): \"" + text.slice(0, 80) + "\"");
            this.emit("orchestrator:commentary", { text, persona });

            if (rewriteText && msgId) {
                this.emit("orchestrator:continuity_editor_rewrite", { id: msgId, newText: rewriteText, persona, commentaryText: text });
            }

            return { text, persona, skipped: false };
        } catch (e) {
            Middleware.log("[Orchestrator] commentary failed:", e.message);
            if (!this._handleConnError(e)) {
                this.emit("orchestrator:error", { stage: "commentary", message: e.message });
            }
            return { text: "", skipped: true, error: e.message };
        }
    }
}

// ── Singleton export ──────────────────────────────────────────
const orchestrator = new MultiModelOrchestrator();
module.exports = orchestrator;
module.exports.MultiModelOrchestrator = MultiModelOrchestrator;
