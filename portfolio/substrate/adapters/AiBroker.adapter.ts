// ──────────────────────────────────────────────────────────────────
// File:    AiBroker.adapter.ts
// Version: 5.1.0
// Updated: 2026-06-27T00:00:00Z
// Changes: V1 compliance — removed fs.writeFileSync to peer module,
//          removed monkey-patching of live registry instance,
//          removed Function() forbidden string (use standard import()),
//          replaced hardcoded C:\protoai\... paths with env vars.
//          Patch requests now route through registry broadcast so the
//          Coach → ProbationOfficer → Registrar pipeline owns healing.
// ──────────────────────────────────────────────────────────────────

import { SdoaManifest, Registry } from '../services/Registry.service';

export class AiBrokerAdapter {
  static MANIFEST: SdoaManifest = {
    id: "AiBroker.adapter",
    type: "adapter",
    layer: 3,
    runtime: "NodeJS",
    version: "5.1.0",
    operationalRole: "coach",
    requires: ["Registry.service"],
    lifecycle: ["init"],
    actions: {
      commands: {
        healTestFailure: {
          description: "Broker that intercepts test failures and dispatches AI self-healing patch requests via the registry pipeline",
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
      description: "AI patch synthesis broker. Synthesises a patch description and emits heal:patch-request into the registry so the Coach → ProbationOfficer → Registrar pipeline owns writing and hot-swapping.",
      author: "ProtoAI team",
      sdoa: "5.0.0"
    }
  };

  private registry!: Registry;

  async init(registry: Registry): Promise<void> {
    this.registry = registry;
  }

  async healTestFailure(expr: string, expected: any, actual: any): Promise<boolean> {
    console.log(`\nSDOA v5: [AiBroker] Intercepted failure for: "${expr}". Expected: ${expected}, Got: ${actual}`);

    this.registry.broadcast({
      type: 'healing-event',
      status: 'thinking',
      expr,
      expected,
      actual,
      message: `Intercepted failure. Initialising AI self-healing pipeline...`
    });

    // Resolve model path from environment — no hardcoded machine paths
    const modelPath = process.env.PROTOAI_GGUF_MODEL;
    if (!modelPath) {
      console.log(`SDOA v5: [AiBroker] PROTOAI_GGUF_MODEL env var not set — cannot synthesise patch.`);
      this.registry.broadcast({
        type: 'healing-event',
        status: 'error',
        expr,
        expected,
        actual,
        message: `PROTOAI_GGUF_MODEL not configured. Set env var to enable local model healing.`
      });
      return false;
    }

    let patch: { search: string; replace: string } | null = null;

    try {
      // Standard dynamic import — no Function() forbidden string
      const { getLlama, LlamaChatSession } = await import('node-llama-cpp');

      this.registry.broadcast({
        type: 'healing-event',
        status: 'thinking',
        expr,
        expected,
        actual,
        message: `Loading GGUF model for inference...`
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

Respond ONLY with JSON matching this shape:
{ "search": "<exact failing line>", "replace": "<corrected line>" }`;

      const t0     = Date.now();
      const result = await session.prompt(promptText, { maxTokens: 128, temperature: 0.1 });
      seq.dispose();

      console.log(`SDOA v5: [AiBroker] Inference complete in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

      let text = result.trim();
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*\})/);
      if (jsonMatch) text = jsonMatch[1].trim();

      patch = JSON.parse(text);
    } catch (err: any) {
      console.log(`SDOA v5: [AiBroker] Model inference error: ${err.message || err}`);
    }

    if (!patch?.search || !patch?.replace) {
      this.registry.broadcast({
        type: 'healing-event',
        status: 'error',
        expr,
        expected,
        actual,
        message: `Failed to synthesise patch for "${expr}".`
      });
      return false;
    }

    // Emit a patch-request into the registry pipeline.
    // The Coach → ProbationOfficer → Registrar pipeline owns writing
    // to disk and hot-swapping the live module — this adapter must NOT
    // write files or mutate registry instances directly.
    this.registry.broadcast({
      type: 'heal:patch-request',
      targetModuleId: 'Evaluator.service',
      patch,
      meta: { expr, expected, actual }
    });

    this.registry.broadcast({
      type: 'healing-event',
      status: 'compiled',
      expr,
      expected,
      actual,
      message: `Patch dispatched to healing pipeline: replace "${patch.search.trim()}" with "${patch.replace.trim()}"`
    });

    console.log(`SDOA v5: [AiBroker] Patch request emitted. Healing pipeline will apply and validate.`);
    return true;
  }
}
