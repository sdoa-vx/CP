// ──────────────────────────────────────────────────────────────────
// File:    TokenBudget.adapter.ts
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// ============================================================
// TokenBudget.adapter.ts — SDOA v5.0 Adapter
// version: 5.0.0
// Last modified: 2026-06-02 01:30 UTC
// ============================================================

import { SdoaManifest } from '../services/Registry.service';

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "gpt-4-turbo": 128000,
  "gpt-4": 8192,
  "o1": 200000,
  "o3": 200000,
  "o4-mini": 200000,
  "claude-3.5-sonnet": 200000,
  "claude-3-haiku": 200000,
  "claude-opus-4": 200000,
  "claude-sonnet-4": 200000,
  "nvidia/nemotron": 131072,
  "qwen": 131072,
  "deepseek": 131072,
  "gemini": 1048576,
  "mistral": 32768,
  "llama": 131072,
};

export class TokenBudgetAdapter {
  static MANIFEST: SdoaManifest = {
    id: "TokenBudget.adapter",
    type: "adapter",
    layer: 3,
    runtime: "NodeJS",
    version: "5.0.0",
    operationalRole: "savant",
    optimization: {
      priority: "readability",
      assertionSuite: ""
    },
    docs: {
      description: "Pre-flight context window budgeting and model limit checks.",
      author: "ProtoAI team",
      sdoa: "5.0.0"
    }
  };

  lookupContextLimit(model: string): number {
    if (!model) return 131072;
    const m = model.toLowerCase();
    for (const [prefix, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
      if (m.includes(prefix.toLowerCase())) return limit;
    }
    return 131072;
  }

  estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 3.5);
  }

  trimToFit(systemPrompt: string, message: string, model: string, maxOutputTokens: number = 4096): string {
    const contextLimit = this.lookupContextLimit(model);
    const messageTokens = this.estimateTokens(message);
    const budgetForSystem = contextLimit - maxOutputTokens - messageTokens - 512;

    if (budgetForSystem <= 0) {
      console.log(`[TokenBudget] Context budget exhausted — message is ${messageTokens} tokens vs ${contextLimit} limit`);
      return "";
    }

    const systemTokens = this.estimateTokens(systemPrompt);
    if (systemTokens <= budgetForSystem) {
      return systemPrompt;
    }

    const allowedChars = Math.floor(budgetForSystem * 3.5);
    console.log(`[TokenBudget] Trimming system prompt from ${systemPrompt.length} chars to ~${allowedChars} chars for model ${model}`);
    return systemPrompt.slice(0, allowedChars) + "\n\n[... context trimmed to fit model window ...]";
  }
}
