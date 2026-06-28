// ──────────────────────────────────────────────────────────────────
// File:    AiBroker.adapter.ts
// Version: 5.2.0
// Updated: 2026-06-27T00:00:00Z
// Changes: Step 13 — healing path decommissioned. AiSleeve.module.ts
//          is the sole GGUF inference boundary sovereign (v5.4 §2.7).
//          AiBroker retains its adapter identity for registry continuity
//          but healTestFailure() now delegates to AiSleeve rather than
//          running its own inference loop. No module other than AiSleeve
//          may emit heal:patch-request.
// ──────────────────────────────────────────────────────────────────

import { SdoaManifest, Registry } from '../services/Registry.service';

export class AiBrokerAdapter {
  static MANIFEST: SdoaManifest = {
    id: "AiBroker.adapter",
    type: "adapter",
    layer: 3,
    runtime: "NodeJS",
    version: "5.2.0",
    operationalRole: "coach",
    requires: ["Registry.service", "AiSleeve.module"],
    lifecycle: ["init"],
    actions: {
      commands: {
        healTestFailure: {
          description: "DEPRECATED as direct healing path. Delegates to AiSleeve.healTestFailure() — the sole boundary sovereign for GGUF inference and heal:patch-request emission.",
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
      description: "Legacy adapter retained for registry continuity. Healing path ownership transferred to AiSleeve (v5.4) → Coach → ProbationOfficer → Registrar.fieldChampion().",
      author: "ProtoAI team",
      sdoa: "5.4.0"
    }
  };

  private registry!: Registry;

  async init(registry: Registry): Promise<void> {
    this.registry = registry;
  }

  // Delegates to AiSleeve — the sole module permitted to run GGUF inference
  // and emit heal:patch-request. AiBroker must not duplicate this path.
  async healTestFailure(expr: string, expected: any, actual: any): Promise<boolean> {
    const sleeve = this.registry.get('AiSleeve.module') as any;
    if (!sleeve) {
      console.warn('[AiBroker] AiSleeve.module not in registry — cannot delegate healing.');
      return false;
    }
    return sleeve.healTestFailure(expr, expected, actual);
  }
}
