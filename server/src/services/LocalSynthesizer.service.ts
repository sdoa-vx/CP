import { PrimeDiscovery } from "./PrimeDiscovery.service";
import { Chronicle } from "./Chronicle.service";
import { emit } from "../engine/events";
import { randomUUID } from "crypto";
import { AiProviderManager } from "./AiProviderManager.service";
import fs from "fs";
import path from "path";

export class LocalSynthesizerService {
  private timer: any = null;

  async init() {
    // Start background auto-synthesis every 30 seconds
    this.timer = setInterval(() => {
      this.autoRun();
    }, 30000);
  }

  async run() {
    return { status: "ready" };
  }

  async dispose() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async autoRun() {
    const db = PrimeDiscovery.getDatabase();
    if (!db) return;

    try {
      // Find one pending candidate
      const candidate = db.prepare(`SELECT * FROM innovation_candidates WHERE status = 'pending' LIMIT 1`).get() as any;
      if (candidate) {
        await this.synthesize(candidate.id);
      }
    } catch (e) {
      Chronicle.recordEvent("synthesizer:auto_run_failed", { error: (e as Error).message }, "LocalSynthesizer");
    }
  }

  async synthesize(candidateId: string) {
    const db = PrimeDiscovery.getDatabase();
    if (!db) throw new Error("Database not ready");

    const candidate = db.prepare(`SELECT * FROM innovation_candidates WHERE id = ?`).get(candidateId) as any;
    if (!candidate) throw new Error(`Candidate ${candidateId} not found`);

    if (candidate.status !== 'pending' && candidate.status !== 'failed') {
      throw new Error(`Candidate ${candidateId} is already in state: ${candidate.status}`);
    }

    Chronicle.recordEvent("synthesizer:started", { candidateId }, "LocalSynthesizer");

    try {
      const artifactName = path.basename(candidate.source_file, path.extname(candidate.source_file));
      const sovereignName = `${artifactName}Innovation`;
      const sanitizedSovereignName = sovereignName.replace(/[^A-Za-z0-9]/g, "");
      
      const experimentalDir = path.resolve(process.cwd(), "server", "src", "evolution", "experimental");
      if (!fs.existsSync(experimentalDir)) {
        fs.mkdirSync(experimentalDir, { recursive: true });
      }

      const generatedModulePath = path.resolve(experimentalDir, `${sanitizedSovereignName}.service.ts`);
      
      const prompt = `
You are an expert SDOA (Sovereign Distributed Operating Architecture) module synthesizer.
Your task is to generate a fully compliant TypeScript module based on this candidate:
Name: ${sanitizedSovereignName}
Pattern: ${candidate.pattern_type}
Reasoning: ${candidate.reasoning}

REQUIREMENTS:
1. The file MUST export a constant named MANIFEST of type SDOA Manifest.
2. The MANIFEST must include: id (string), type ("service", "adapter", "task", etc), layer (number 1-7), runtime ("TypeScript"), version (string), operationalRole (string).
3. The file MUST export a class matching the service name (e.g., \`${sanitizedSovereignName}Service\`).
4. The file MUST export an instance of the class (e.g., \`export const ${sanitizedSovereignName} = new ${sanitizedSovereignName}Service();\`).
5. Only output the RAW TypeScript code. Do NOT wrap it in markdown code blocks (\`\`\`). Do NOT include any explanations or conversational text. Output ONLY the code.
`;

      const generatedCode = await AiProviderManager.generate(prompt);
      fs.writeFileSync(generatedModulePath, generatedCode);

      PrimeDiscovery.updateCandidateStatus(candidateId, 'synthesized', generatedModulePath);

      Chronicle.recordEvent("synthesizer:completed", { candidateId, generatedModulePath }, "LocalSynthesizer");
      
      // Emit the event for ProbationOfficer to pick up
      emit("innovation:synthesized", { candidateId, generatedModulePath });
      
      return { ok: true, candidateId, generatedModulePath };
    } catch (e: any) {
      Chronicle.recordEvent("synthesizer:ollama_failed", { candidateId, error: e.message }, "LocalSynthesizer");
      
      // Fallback: A "Yes, And" system
      // If local intelligence fails, we package it up for the FISP pipeline
      try {
        Chronicle.recordEvent("synthesizer:fisp_fallback_started", { candidateId }, "LocalSynthesizer");
        await this._fallbackToFISP(candidate);
        
        PrimeDiscovery.updateCandidateStatus(candidateId, 'delegated', undefined, undefined, "Delegated to external FISP due to local AI unavailability.");
        emit("innovation:delegated", { candidateId, reason: "Local intelligence unavailable." });
        return { ok: true, candidateId, delegated: true };
      } catch (fispError: any) {
        // If even the fallback fails, then we truly fail.
        PrimeDiscovery.updateCandidateStatus(candidateId, 'failed', undefined, undefined, `Local and FISP synthesis both failed: ${fispError.message}`);
        Chronicle.recordEvent("synthesizer:failed_completely", { candidateId, error: fispError.message }, "LocalSynthesizer");
        emit("innovation:failed", { candidateId, error: fispError.message });
        throw fispError;
      }
    }
  }

  private async _fallbackToFISP(candidate: any) {
    const proposalId = `fisp_prop_${randomUUID().substring(0, 8)}`;
    const envelope = {
      proposalId,
      version: "1.0",
      timestamp: new Date().toISOString(),
      innovations: [
        {
          id: `innov_${randomUUID().substring(0, 8)}`,
          type: candidate.pattern_type || "module",
          name: candidate.name || path.basename(candidate.source_file, path.extname(candidate.source_file)),
          version: "1.0.0",
          source: {
            language: "ts",
            content: "", // External agent must fill this in
            path: ""
          },
          sdoa: {
            layer: 4,
            placement: "substrate",
            manifest: {
              operationalRole: "infrastructure",
              optimization: { priority: "stability" }
            }
          },
          metrics: {
            usageCount: 1,
            projectsObserved: 1,
            confidence: candidate.confidence
          }
        }
      ]
    };

    const PORT = process.env.PORT || 8080;
    const res = await fetch(`http://127.0.0.1:${PORT}/fisp/v1/proposals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope)
    });
    
    if (!res.ok) {
      const result = await res.json().catch(() => ({}));
      throw new Error(`Pipeline rejected proposal: ${JSON.stringify(result)}`);
    }
  }
}

export const LocalSynthesizer = new LocalSynthesizerService();
