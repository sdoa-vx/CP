// ──────────────────────────────────────────────────────────────────
// File:    AiProvider.adapter.js
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure (6.9-only file)
// ──────────────────────────────────────────────────────────────────
"use strict";

const https = require("https"), http = require("http"), fs = require("fs"), path = require("path");

class AiProviderAdapter {
  static MANIFEST = {
    id: "AiProvider.adapter", type: "adapter", layer: 3, runtime: "NodeJS", version: "5.0.1",
    last_modified: "2026-07-13T00:00:00Z",
    operationalRole: "savant",
    requires: ["Chronicle.service"],
    dependencies: ["Chronicle.service"],
    capabilities: ["llm:complete", "llm:stream", "llm:list-models", "llm:set-model", "llm:count-tokens"],
    dataFiles: [], lifecycle: ["init", "run", "dispose"],
    actions: {
      commands: {
        complete:    { description: "Send a prompt to the configured LLM and return the full response text.", input: { prompt: "string", system: "string?", model: "string?", format: "string?", sessionId: "string?", maxTokens: "number?", temperature: "number?" }, output: "string" },
        stream:      { description: "Send a prompt and stream the response via EventBus chunks.", input: { prompt: "string", system: "string?", model: "string?", sessionId: "string?", streamId: "string" }, output: "void" },
        listModels:  { description: "Return the list of configured models from settings.", input: {}, output: "object[]" },
        setModel:    { description: "Override the active model at runtime.", input: { model: "string" }, output: "void" },
        countTokens: { description: "Estimate token count for a string (rough: 1 token ≈ 4 chars).", input: { text: "string" }, output: "number" }
      },
      events: {
        "ai:requestStarted":   { payload: { model: "string", sessionId: "string?", promptTokens: "number" } },
        "ai:responseReceived": { payload: { model: "string", sessionId: "string?", durationMs: "number", tokens: "number" } },
        "ai:streamChunk":      { payload: { streamId: "string", chunk: "string", index: "number" } },
        "ai:streamDone":       { payload: { streamId: "string", totalChunks: "number", durationMs: "number" } },
        "ai:error":            { payload: { model: "string", error: "string", willRetry: "boolean" } }
      },
      accepts: {}, slots: {}
    },
    docs: {
      description: "Unified LLM gateway adapter. Routes completion requests to OpenRouter, Anthropic, OpenAI, or local llama.cpp endpoints based on settings configuration. Implements retry with fallback chain, streaming via EventBus chunks, token estimation, and Chronicle recording of all completions. The single dependency that Interpreter.workflow and Scaffold.workflow need to go live.",
      author: "ProtoAI Core Architecture Group", sdoa: "5.0.0"
    }
  };

  _settings = null; _activeModel = null; _registry = null; _chronicle = null;

  async init(registry) {
    this._registry    = registry;
    this._chronicle   = registry?.get?.("Chronicle.service");
    this._settings    = this._loadSettings();
    this._activeModel = this._settings?.defaultModel ?? "openai/gpt-4o-mini";
  }

  async run()     { return { status: "ready", model: this._activeModel }; }
  async dispose() { this._settings = null; this._chronicle = null; this._registry = null; }

  async complete({ prompt, system = "", model, sessionId, maxTokens, temperature } = {}) {
    const m   = model ?? this._activeModel;
    const t0  = Date.now();
    const pts = this.countTokens({ text: (system || "") + prompt });
    this._emit("ai:requestStarted", { model: m, sessionId, promptTokens: pts });

    const keys    = this._settings?.apiKeys ?? {};
    const primary = this._parseProviderFromModel(m);
    const chain   = [primary, ...(this._settings?.fallbackList ?? ["openrouter", "openai", "anthropic", "local"]).filter(p => p !== primary)];
    let lastErr;

    for (const provider of chain) {
      try {
        const body = this._buildBody(provider, m, system, prompt, maxTokens ?? 2048, temperature ?? 0.7, false);
        const opts = this._buildRequestOptions(provider, keys);
        const text = this._extractResponseText(provider, JSON.parse(await this._makeHttpRequest(opts, body)));
        const ms   = Date.now() - t0;
        const rt   = this.countTokens({ text });
        this._emit("ai:responseReceived", { model: m, sessionId, durationMs: ms, tokens: rt });
        this._chronicle?.record({ type: "ai:completion", source: "AiProvider.adapter",
          payload: { model: m, sessionId, promptTokens: pts, responseTokens: rt, durationMs: ms } });
        return text;
      } catch (e) { lastErr = e; this._emit("ai:error", { model: m, error: e.message, willRetry: true }); }
    }
    this._emit("ai:error", { model: m, error: lastErr?.message, willRetry: false });
    throw lastErr ?? new Error("All providers failed");
  }

  async stream({ prompt, system = "", model, sessionId, streamId } = {}) {
    const m        = model ?? this._activeModel;
    const keys     = this._settings?.apiKeys ?? {};
    const provider = this._parseProviderFromModel(m);
    const t0       = Date.now();
    let index      = 0;
    await this._makeStreamRequest(
      this._buildRequestOptions(provider, keys),
      this._buildBody(provider, m, system, prompt, 2048, 0.7, true),
      (chunk) => this._emit("ai:streamChunk", { streamId, chunk, index: index++ })
    );
    this._emit("ai:streamDone", { streamId, totalChunks: index, durationMs: Date.now() - t0 });
  }

  listModels()                { return this._settings?.models ?? [{ id: this._activeModel, name: this._activeModel }]; }
  setModel({ model } = {})   { this._activeModel = model; }
  countTokens({ text } = {}) { return Math.ceil((text || "").length / 4); }

  // ── Private ──────────────────────────────────────────────────────────────

  _parseProviderFromModel(m = "") {
    if (m.startsWith("local-") || m.startsWith("llama")) return "local";
    if (m.startsWith("claude-"))                          return "anthropic";
    if (m.includes("/"))                                  return "openrouter";
    return "openai";
  }

  _buildRequestOptions(provider, keys = {}) {
    const port = this._settings?.localPort ?? 8080;
    const map = {
      openrouter: { hostname: "openrouter.ai",     port: 443, path: "/api/v1/chat/completions", method: "POST",
        headers: { "Authorization": `Bearer ${keys.openrouter}`, "HTTP-Referer": "https://protoai.dev", "X-Title": "ProtoAI", "Content-Type": "application/json" } },
      anthropic:  { hostname: "api.anthropic.com", port: 443, path: "/v1/messages",             method: "POST",
        headers: { "x-api-key": keys.anthropic, "anthropic-version": "2023-06-01", "Content-Type": "application/json" } },
      openai:     { hostname: "api.openai.com",    port: 443, path: "/v1/chat/completions",     method: "POST",
        headers: { "Authorization": `Bearer ${keys.openai}`, "Content-Type": "application/json" } },
      local:      { hostname: "localhost",          port,      path: "/completion",              method: "POST",
        headers: { "Content-Type": "application/json" } },
    };
    return map[provider] ?? map.openrouter;
  }

  _buildBody(provider, model, system, prompt, maxTokens, temperature, stream) {
    if (provider === "anthropic")
      return JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] });
    if (provider === "local")
      return JSON.stringify({ prompt: (system ? system + "\n\n" : "") + prompt, n_predict: maxTokens || 512, temperature });
    const msgs = [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: prompt }];
    return JSON.stringify({ model, messages: msgs, max_tokens: maxTokens, temperature, stream });
  }

  _extractResponseText(provider, parsed) {
    if (provider === "anthropic") return parsed.content?.[0]?.text ?? "";
    if (provider === "local")     return parsed.content ?? "";
    return parsed.choices?.[0]?.message?.content ?? "";
  }

  _makeHttpRequest(options, body) {
    return new Promise((resolve, reject) => {
      const buf  = Buffer.from(body);
      const opts = { ...options, headers: { ...options.headers, "Content-Length": buf.length } };
      const lib  = options.port === 443 ? https : http;
      const req  = lib.request(opts, (res) => {
        let data = "";
        res.on("data", c => (data += c));
        res.on("end", () => res.statusCode >= 400
          ? reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`))
          : resolve(data));
      });
      req.setTimeout(120000, () => { req.destroy(); reject(new Error("Request timeout")); });
      req.on("error", reject);
      req.write(buf);
      req.end();
    });
  }

  _makeStreamRequest(options, body, onChunk) {
    return new Promise((resolve, reject) => {
      const buf  = Buffer.from(body);
      const opts = { ...options, headers: { ...options.headers, "Content-Length": buf.length } };
      const lib  = options.port === 443 ? https : http;
      const req  = lib.request(opts, (res) => {
        let sbuf = "";
        res.on("data", chunk => {
          sbuf += chunk.toString();
          const lines = sbuf.split("\n"); sbuf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") continue;
            try {
              const d = JSON.parse(raw);
              const t = d.choices?.[0]?.delta?.content ?? d.delta?.text ?? "";
              if (t) onChunk(t);
            } catch (_) {}
          }
        });
        res.on("end", resolve);
        res.on("error", reject);
      });
      req.setTimeout(120000, () => { req.destroy(); reject(new Error("Stream timeout")); });
      req.on("error", reject);
      req.write(buf);
      req.end();
    });
  }

  _loadSettings() {
    // V7: no hardcoded machine-absolute paths — only cwd-relative candidates
    const candidates = [
      path.join(process.cwd(), "ui", "data", "settings.json"),
      path.join(process.cwd(), "data", "settings.json"),
      ...(process.env.PROTOAI_SETTINGS ? [process.env.PROTOAI_SETTINGS] : []),
    ];
    for (const p of candidates) {
      try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) {}
    }
    return {};
  }

  _getBus()             { return this._registry?.get?.("EventBus.service"); }
  _emit(name, payload)  { try { this._getBus()?.emit?.(name, payload); } catch (_) {} }
}

module.exports = AiProviderAdapter;
