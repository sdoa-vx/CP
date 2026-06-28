// ──────────────────────────────────────────────────────────────────
// File:    AiSleeve.module.ts
// Version: 1.0.0
// Updated: 2026-06-27T00:00:00Z
// Changes: Phase 2 Step 6 — Sleeve ratification (SDOA v5.4 §2.7).
//          Replaces AiBroker.adapter. Reclassified as type "sleeve".
//          external.system = "node-llama-cpp", transport = "node-module".
//          All V1 compliance retained: no fs.writeFileSync, no Function(),
//          no hardcoded paths, no monkey-patching.
// ──────────────────────────────────────────────────────────────────

import { SdoaManifest, Registry } from '../services/Registry.service';

export class AiSleeve {
  static MANIFEST: SdoaManifest & { external: object } = {
    id: "AiSleeve.module",
    type: "adapter",   // "sleeve" pending typedef extension in SdoaManifest
    layer: 3,
    runtime: "NodeJS",
    version: "1.0.0",
    operationalRole: "coach",
    requires: ["Registry.service", "ResponseFormatter.service", "PathResolver.service"],
    lifecycle: ["init"],
    external: {
      system: "node-llama-cpp",
      transport: "node-module",
      path: "auto",
      commands: ["getLlama", "LlamaChatSession"]
    },
    capabilities: [
      "ai.patch-synthesis",
      "ai.gguf-inference"
    ],
    actions: {
      commands: {
        healTestFailure: {
          description: "Intercepts test failures, runs local GGUF model inference to synthesise a patch, then emits heal:patch-request into the registry pipeline.",
          input: { expr: "string", expected: "any", actual: "any" },
          output: "Promise<boolean>"
        }
      }
    },
    optimization: {
      priority: "readability",
      assertionSuite: ""
    },
    docs: {
      description: "Sleeve boundary module wrapping node-llama-cpp. Synthesises patch descriptions from GGUF model inference, then emits heal:patch-request for the Coach → ProbationOfficer → Registrar pipeline. Never writes files or mutates live instances directly.",
      author: "ProtoAI team",
      sdoa: "5.4.0"
    }
  };

  private registry!: Registry;

  async init(registry: Registry): Promise<void> {
    this.registry = registry;
  }

  async healTestFailure(expr: string, expected: any, actual: any): Promise<boolean> {
    console.log(`\n[AiSleeve] Intercepted failure: "${expr}". Expected: ${expected}, Got: ${actual}`);

    this.registry.broadcast({
      type: 'healing-event',
      status: 'thinking',
      expr, expected, actual,
      message: `Intercepted failure. Initialising AI sleeve inference...`
    });

    // Model path from environment only — no hardcoded machine paths (§3.1)
    const modelPath = process.env.PROTOAI_GGUF_MODEL;
    if (!modelPath) {
      this.registry.broadcast({
        type: 'healing-event', status: 'error',
        expr, expected, actual,
        message: `PROTOAI_GGUF_MODEL not set. Cannot synthesise patch.`
      });
      return false;
    }

    let patch: { search: string; replace: string } | null = null;

    try {
      // Standard dynamic import — no Function() constructor (ProbationOfficer SLEEVE_NO_EVAL)
      const { getLlama, LlamaChatSession } = await import('node-llama-cpp');

      this.registry.broadcast({
        type: 'healing-event', status: 'thinking',
        expr, expected, actual,
        message: `Loading GGUF model...`
      });

      const llama = await getLlama({ gpu: false });
      const model = await llama.loadModel({ modelPath });
      const ctx   = await model.createContext({ contextSize: 1024, batchSize: 128, threads: 4 });
      const seq   = ctx.getSequence();

      const session = new LlamaChatSession({
        contextSequence: seq,
        systemPrompt: "You are an autonomous AI self-healing compiler. Respond only with JSON and nothing else."
      });

      const promptText = `A test case failed.
Failing Expression: ${expr}
Expected Output: ${expected}
Actual Output: ${actual}

Respond ONLY with JSON: { "search": "<exact failing line>", "replace": "<corrected line>" }`;

      const t0     = Date.now();
      const result = await session.prompt(promptText, { maxTokens: 128, temperature: 0.1 });
      seq.dispose();
      console.log(`[AiSleeve] Inference in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

      let text = result.trim();
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
      if (jsonMatch) text = jsonMatch[1].trim();
      patch = JSON.parse(text);
    } catch (err: any) {
      console.log(`[AiSleeve] Inference error: ${err.message || err}`);
    }

    if (!patch?.search || !patch?.replace) {
      this.registry.broadcast({
        type: 'healing-event', status: 'error',
        expr, expected, actual,
        message: `Failed to synthesise patch for "${expr}".`
      });
      return false;
    }

    // Route through registry — sleeve NEVER writes files directly (§3.1)
    this.registry.broadcast({
      type: 'heal:patch-request',
      targetModuleId: 'Evaluator.service',
      patch,
      meta: { expr, expected, actual }
    });

    this.registry.broadcast({
      type: 'healing-event', status: 'compiled',
      expr, expected, actual,
      message: `Patch dispatched: replace "${patch.search.trim()}" with "${patch.replace.trim()}"`
    });

    return true;
  }
}
