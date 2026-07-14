// ──────────────────────────────────────────────────────────────────
// File:    VisualOrchestrator.service.ts
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure
// ──────────────────────────────────────────────────────────────────
// ============================================================
// VisualOrchestrator.service.ts — SDOA v5.0 Service
// version: 5.0.0
// Last modified: 2026-06-01 14:45 UTC
// ============================================================

import { SdoaManifest, Registry } from './Registry.service';
import * as fs from 'fs';
import * as path from 'path';

export class VisualOrchestratorService {
  static MANIFEST: SdoaManifest = {
    id: "VisualOrchestrator.service",
    type: "service",
    layer: 3,
    runtime: "NodeJS",
    version: "5.0.1",
    last_modified: "2026-07-13T00:00:00Z",
    operationalRole: "savant",
    requires: ["Registry.service"],
    dependencies: ["Registry.service"],
    capabilities: ["blueprint:generate"],
    lifecycle: ["init"],
    actions: {
      commands: {
        generateBlueprint: {
          description: "Generates blueprint.schema.json for visual orchestrators",
          input: { outputPath: "string" },
          output: "void"
        }
      }
    },
    optimization: {
      priority: "readability",
      assertionSuite: ""
    },
    docs: {
      description: "Generates the unified visual flowchart schema map from registered manifests.",
      author: "ProtoAI team",
      sdoa: "5.0.0"
    }
  };

  private registry!: Registry;

  async init(registry: Registry): Promise<void> {
    this.registry = registry;
  }

  generateBlueprint(outputPath: string): void {
    const modules = this.registry.getAllRegisteredModules();
    const blueprint: Record<string, any> = {
      sdoaVersion: "5.0.0",
      generatedAt: new Date().toISOString(),
      nodes: [],
      connections: []
    };

    for (const modId of modules) {
      try {
        const manifest = this.registry.getManifest(modId);

        // Define visual node representation
        const node = {
          id: manifest.id,
          type: manifest.type,
          layer: manifest.layer,
          version: manifest.version,
          operationalRole: manifest.operationalRole || "",
          optimization: manifest.optimization || null,
          description: manifest.docs?.description || "",
          commands: manifest.actions?.commands ? Object.keys(manifest.actions.commands) : [],
          accepts: manifest.actions?.accepts ? Object.keys(manifest.actions.accepts) : [],
          events: manifest.actions?.events ? Object.keys(manifest.actions.events) : [],
        };
        blueprint.nodes.push(node);

        // Map require dependencies as connection lines
        if (manifest.requires) {
          for (const req of manifest.requires) {
            if (req !== "Types") {
              blueprint.connections.push({
                from: req,
                to: manifest.id,
                type: "requires"
              });
            }
          }
        }

        // Map accepts to events for automatic flow mapping
        if (manifest.actions?.accepts) {
          for (const trigName of Object.keys(manifest.actions.accepts)) {
            // Find if any other module emits this event name
            for (const senderId of modules) {
              const senderManifest = this.registry.getManifest(senderId);
              if (senderManifest.actions?.events && senderManifest.actions.events[trigName]) {
                blueprint.connections.push({
                  from: senderId,
                  to: manifest.id,
                  type: "event_link",
                  event: trigName
                });
              }
            }
          }
        }
      } catch (err) {
        // Skip modules without manifests (e.g. dynamic raw wasm exports)
      }
    }

    const fullPath = path.resolve(outputPath);
    fs.writeFileSync(fullPath, JSON.stringify(blueprint, null, 2), 'utf-8');
    console.log(`SDOA v5: Successfully generated visual blueprint schema at: ${fullPath}`);
  }
}
