// ──────────────────────────────────────────────────────────────────
// File:    SendMessage.workflow.js
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure; adjusted require paths
// ──────────────────────────────────────────────────────────────────
"use strict";
// ============================================================
// SendMessage.workflow.js — SDOA v5.0 Workflow
// version: 5.0.0
// Last modified: 2026-06-02 01:30 UTC
// ============================================================
const PersistentMemory_service_1 = require("../services/PersistentMemory.service");
const TokenBudget_adapter_1 = require("../adapters/TokenBudget.adapter");
const LlmConnector_adapter_1 = require("../adapters/LlmConnector.adapter");
class SendMessageWorkflow {
    constructor() {
        this._settingsPath = "";
    }
    async init(registry) {
        try {
            this.memoryService = registry.get("PersistentMemory.service");
        }
        catch (_) { }
        try {
            this.budgetAdapter = registry.get("TokenBudget.adapter");
        }
        catch (_) { }
        try {
            this.connectorAdapter = registry.get("LlmConnector.adapter");
        }
        catch (_) { }
        // Dynamic resolution matching Tauri app kernel workspace structure
        try {
            const paths = require("../access/env/paths");
            const FsProfileRepository = require("../access/fs/FsProfileRepository");
            const FsProjectRepository = require("../access/fs/FsProjectRepository");
            this.profileRepo = new FsProfileRepository();
            this.projectRepo = new FsProjectRepository();
            this._settingsPath = paths.data("settings.json");
        }
        catch (_) {
            // Fallbacks for test harness scope if needed
        }
    }
    _getApiKeys() {
        try {
            const fs = require('fs');
            if (fs.existsSync(this._settingsPath)) {
                return JSON.parse(fs.readFileSync(this._settingsPath, "utf8")).apiKeys || {};
            }
        }
        catch (_) { }
        return {};
    }
    _detectProvider(model) {
        if (!model)
            return "openrouter";
        const m = model.toLowerCase();
        if (m.startsWith("claude"))
            return "anthropic";
        if (m.startsWith("gpt-") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4") || m.startsWith("chatgpt"))
            return "openai";
        return "openrouter";
    }
    _readCatalog() {
        try {
            const fs = require('fs');
            const paths = require("../access/env/paths");
            const p = paths.data("models.catalog.json");
            if (fs.existsSync(p))
                return JSON.parse(fs.readFileSync(p, "utf8"));
        }
        catch (_) { }
        return null;
    }
    async run(context) {
        if (!this.memoryService)
            this.memoryService = new PersistentMemory_service_1.PersistentMemoryService();
        if (!this.budgetAdapter)
            this.budgetAdapter = new TokenBudget_adapter_1.TokenBudgetAdapter();
        if (!this.connectorAdapter)
            this.connectorAdapter = new LlmConnector_adapter_1.LlmConnectorAdapter();
        const WorkflowResult = require("./WorkflowResult");
        const { project, message, profile: profileId, engine, onChunk, systemPrompt: explicitSystemPrompt } = context || {};
        if (!project || !message) {
            return WorkflowResult.error("Missing required fields: project, message");
        }
        const apiKeys = this._getApiKeys();
        let systemPrompt = "";
        let resolvedModel = null;
        try {
            let prof = null;
            if (profileId && profileId !== "default") {
                prof = this.profileRepo.resolveProfile(profileId);
            }
            if (!prof) {
                const catalog = this._readCatalog();
                const activeArchetypeId = catalog?.activeArchetype;
                if (activeArchetypeId) {
                    prof = this.profileRepo.resolveProfile(activeArchetypeId);
                }
            }
            if (prof) {
                systemPrompt = explicitSystemPrompt || prof.system || prof.instructions || prof.voice || "";
                if (!engine && prof.model)
                    resolvedModel = prof.model;
            }
            else if (explicitSystemPrompt) {
                systemPrompt = explicitSystemPrompt;
            }
        }
        catch (_) { }
        let model = engine || resolvedModel;
        try {
            const catalog = this._readCatalog();
            if (catalog?.models && model) {
                const matched = catalog.models.find((m) => m.id === model);
                if (matched && matched.name) {
                    model = matched.name;
                }
            }
        }
        catch (_) { }
        if (!model || model === "openrouter") {
            try {
                const catalog = this._readCatalog();
                const first = catalog?.models?.find?.((m) => m.active && m.api !== "image" && m.api !== "video" && m.api !== "audio");
                if (first)
                    model = first.name;
            }
            catch (_) { }
        }
        if (!model || model === "openrouter") {
            model = "openrouter/auto";
        }
        // Append VFS / file context
        try {
            const FileContextWorkflow = require("./FileContext.workflow");
            const pathsMod = require("../access/env/paths");
            const ctxWf = new FileContextWorkflow({ paths: pathsMod });
            const ctxRes = await ctxWf.run({ project });
            if (ctxRes.status === "ok" && ctxRes.data?.context) {
                systemPrompt += (systemPrompt ? "\n\n" : "") + ctxRes.data.context;
            }
        }
        catch (_) { }
        // Append Persistent Memory
        const memContext = await this.memoryService.loadMemoryPrompt(project);
        if (memContext) {
            systemPrompt += (systemPrompt ? "\n\n" : "") + memContext;
        }
        // Pre-flight context budget trimming
        systemPrompt = this.budgetAdapter.trimToFit(systemPrompt, message, model, 4096);
        const provider = this._detectProvider(model);
        try {
            let reply = "";
            if (provider === "anthropic") {
                const key = apiKeys.anthropic || apiKeys.claude || "";
                if (!key)
                    return WorkflowResult.error("Anthropic API key not configured");
                reply = await this.connectorAdapter.callAnthropic(key, model, systemPrompt, message, onChunk || null);
            }
            else if (provider === "openai") {
                const key = apiKeys.openai || "";
                if (!key)
                    return WorkflowResult.error("OpenAI API key not configured");
                reply = await this.connectorAdapter.callOpenAICompat("api.openai.com", key, model, systemPrompt, message, onChunk || null);
            }
            else {
                const key = apiKeys.openrouter || apiKeys.openRouter || "";
                if (!key)
                    return WorkflowResult.error("OpenRouter API key not configured");
                reply = await this.connectorAdapter.callOpenAICompat("openrouter.ai", key, model, systemPrompt, message, onChunk || null);
            }
            if (!reply && !onChunk) {
                return WorkflowResult.error("Model returned no text");
            }
            return WorkflowResult.ok({ reply, streaming: !!onChunk });
        }
        catch (err) {
            return WorkflowResult.error(err.message || String(err));
        }
    }
}
SendMessageWorkflow.MANIFEST = {
    id: "SendMessageWorkflow",
    type: "workflow",
    layer: 3,
    runtime: "NodeJS",
    version: "5.0.0",
    operationalRole: "savant",
    requires: ["PersistentMemory.service", "TokenBudget.adapter", "LlmConnector.adapter"],
    optimization: {
        priority: "readability",
        assertionSuite: ""
    },
    docs: {
        description: "Direct HTTPS LLM chat orchestrator driving context compilation and provider routing.",
        author: "ProtoAI team",
        sdoa: "5.0.0"
    }
};
module.exports = SendMessageWorkflow;
