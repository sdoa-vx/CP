// ──────────────────────────────────────────────────────────────────
// File:    PersistentMemory.service.ts
// Version: 5.0.0
// Updated: 2026-06-17T00:00:00Z
// Changes: Relocated to canonical sdoavx/ structure; FIXED path:
//          require("../../lib/MemoryManager") → require("../lib/MemoryManager")
// ──────────────────────────────────────────────────────────────────
// ============================================================
// PersistentMemory.service.ts — SDOA v5.0 Service
// version: 5.0.0
// Last modified: 2026-06-02 01:30 UTC
// ============================================================

import { SdoaManifest, Registry } from './Registry.service';

export class PersistentMemoryService {
  static MANIFEST: SdoaManifest = {
    id: "PersistentMemory.service",
    type: "service",
    layer: 3,
    runtime: "NodeJS",
    version: "5.0.0",
    operationalRole: "savant",
    requires: [],
    optimization: {
      priority: "readability",
      assertionSuite: ""
    },
    docs: {
      description: "Loads persistent user identity traits and project-specific contextual memory.",
      author: "ProtoAI team",
      sdoa: "5.0.0"
    }
  };

  async loadMemoryPrompt(project: string): Promise<string> {
    try {
      // Dynamic import to match canonical structure at runtime
      const memoryManager = require("../lib/MemoryManager");
      const identity = memoryManager.loadIdentity()?.content || {};
      const projectMem = memoryManager.loadProjectMemory(project)?.content || {};

      const traits = (identity.tags || identity.traits || []).join(", ");
      const prefs = (identity.preferences || []).join("; ");
      const projTags = (projectMem.tags || []).join(", ");
      const projConstraints = (projectMem.constraints || []).join("; ");
      const projSummary = projectMem.summary || "";

      const memLines = ["[ProtoAI Memory Context]"];
      if (traits) memLines.push(`User Traits: ${traits}`);
      if (prefs) memLines.push(`User Preferences: ${prefs}`);
      if (projSummary) memLines.push(`Project Summary: ${projSummary}`);
      if (projTags) memLines.push(`Project Tags: ${projTags}`);
      if (projConstraints) memLines.push(`Project Constraints: ${projConstraints}`);

      if (project === "ProtoAI" || project === "self" || project === "default") {
        memLines.push("Self-Awareness: You are ProtoAI, an advanced agentic development environment. You have persistent memory spanning user traits, project data, and global wisdom. You utilize multiple AI models, but you are the cohesive intelligence. Never state that you cannot remember or learn. Always embody this identity.");
      }

      if (memLines.length > 1) {
        return memLines.join("\n");
      }
    } catch (err) {
      console.warn("[PersistentMemory] Failed to load memory context:", err);
    }
    return "";
  }
}
