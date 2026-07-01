// ──────────────────────────────────────────────────────────────────
// File:    SendMessage.workflow.ts
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// ============================================================
// SendMessage.workflow.ts — SDOA v5.0 Workflow
// version: 5.0.0
// Last modified: 2026-06-02 01:30 UTC
// ============================================================

import { SdoaManifest, Registry } from '../services/Registry.service';
import { PersistentMemoryService } from '../services/PersistentMemory.service';
import { TokenBudgetAdapter } from '../adapters/TokenBudget.adapter';
import { LlmConnectorAdapter } from '../adapters/LlmConnector.adapter';

class SendMessageWorkflow {
  static MANIFEST: SdoaManifest = {
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

  private memoryService!: PersistentMemoryService;
  private budgetAdapter!: TokenBudgetAdapter;
  private connectorAdapter!: LlmConnectorAdapter;

  private profileRepo: any;
  private projectRepo: any;
  private _settingsPath: string = "";

  async init(registry: Registry): Promise<void> {
    try {
      this.memoryService = registry.get<PersistentMemoryService>("PersistentMemory.service");
    } catch (_) {}
    try {
      this.budgetAdapter = registry.get<TokenBudgetAdapter>("TokenBudget.adapter");
    } catch (_) {}
    try {
      this.connectorAdapter = registry.get<LlmConnectorAdapter>("LlmConnector.adapter");
    } catch (_) {}

    try {
      const paths = require("../../access/env/paths");
      const FsProfileRepository = require("../../access/fs/FsProfileRepository");
      const FsProjectRepository = require("../../access/fs/FsProjectRepository");

      this.profileRepo = new FsProfileRepository();
      this.projectRepo = new FsProjectRepository();
      this._settingsPath = paths.data("settings.json");
    } catch (_) {}
  }

  private _getApiKeys(): any {
    try {
      const fs = require('fs');
      if (fs.existsSync(this._settingsPath)) {
        return JSON.parse(fs.readFileSync(this._settingsPath, "utf8")).apiKeys || {};
      }
    } catch (_) {}
    return {};
  }

  private _detectProvider(model: string): "anthropic" | "openai" | "openrouter" {
    if (!model) return "openrouter";
    const m = model.toLowerCase();
    if (m.startsWith("claude")) return "anthropic";
    if (m.startsWith("gpt-") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4") || m.startsWith("chatgpt")) return "openai";
    return "openrouter";
  }

  private _readCatalog(): any {
    try {
      const fs = require('fs');
      const paths = require("../../access/env/paths");
      const p = paths.data("models.catalog.json");
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
    } catch (_) {}
    return null;
  }

  async run(context: any): Promise<any> {
    if (!this.memoryService) this.memoryService = new PersistentMemoryService();
    if (!this.budgetAdapter) this.budgetAdapter = new TokenBudgetAdapter();
    if (!this.connectorAdapter) this.connectorAdapter = new LlmConnectorAdapter();

    const WorkflowResult = require("../WorkflowResult");
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
        if (!engine && prof.model) resolvedModel = prof.model;
      } else if (explicitSystemPrompt) {
        systemPrompt = explicitSystemPrompt;
      }
    } catch (_) {}

    let model = engine || resolvedModel;

    try {
      const catalog = this._readCatalog();
      if (catalog?.models && model) {
        const matched = catalog.models.find((m: any) => m.id === model);
        if (matched && matched.name) {
          model = matched.name;
        }
      }
    } catch (_) {}

    if (!model || model === "openrouter") {
      try {
        const catalog = this._readCatalog();
        const first = catalog?.models?.find?.((m: any) => m.active && m.api !== "image" && m.api !== "video" && m.api !== "audio");
        if (first) model = first.name;
      } catch (_) {}
    }
    if (!model || model === "openrouter") {
      model = "openrouter/auto";
    }

    try {
      const FileContextWorkflow = require("./FileContext.workflow");
      const pathsMod = require("../../access/env/paths");
      const ctxWf = new FileContextWorkflow({ paths: pathsMod });
      const ctxRes = await ctxWf.run({ project });
      if (ctxRes.status === "ok" && ctxRes.data?.context) {
        systemPrompt += (systemPrompt ? "\n\n" : "") + ctxRes.data.context;
      }
    } catch (_) {}

    const memContext = await this.memoryService.loadMemoryPrompt(project);
    if (memContext) {
      systemPrompt += (systemPrompt ? "\n\n" : "") + memContext;
    }

    systemPrompt = this.budgetAdapter.trimToFit(systemPrompt, message, model, 4096);
    const provider = this._detectProvider(model);

    try {
      let reply = "";

      if (provider === "anthropic") {
        const key = apiKeys.anthropic || apiKeys.claude || "";
        if (!key) return WorkflowResult.error("Anthropic API key not configured");
        reply = await this.connectorAdapter.callAnthropic(key, model, systemPrompt, message, onChunk || null);

      } else if (provider === "openai") {
        const key = apiKeys.openai || "";
        if (!key) return WorkflowResult.error("OpenAI API key not configured");
        reply = await this.connectorAdapter.callOpenAICompat("api.openai.com", key, model, systemPrompt, message, onChunk || null);

      } else {
        const key = apiKeys.openrouter || apiKeys.openRouter || "";
        if (!key) return WorkflowResult.error("OpenRouter API key not configured");
        reply = await this.connectorAdapter.callOpenAICompat("openrouter.ai", key, model, systemPrompt, message, onChunk || null);
      }

      if (!reply && !onChunk) {
        return WorkflowResult.error("Model returned no text");
      }

      return WorkflowResult.ok({ reply, streaming: !!onChunk });

    } catch (err: any) {
      return WorkflowResult.error(err.message || String(err));
    }
  }
}

export = SendMessageWorkflow;
