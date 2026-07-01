
import { logger } from "../utils/logger";
import { planCanonicalPath } from "./planCanonicalPath";
import { writeCanonicalFile } from "./writeCanonicalFile";
import { runComplianceSuite } from "./runComplianceSuite";
import { openPrForProposal } from "../workers/prWorker";
import { recordPipelineRun, recordPipelineStep } from "../utils/telemetry";

export const MANIFEST = {
  id: "CreationPipeline.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "[object Object]"
  ],
  dependencies: [
    "../utils/logger",
    "./planCanonicalPath",
    "./writeCanonicalFile",
    "./runComplianceSuite",
    "../workers/prWorker",
    "../utils/telemetry",
    "../fisp/storeProposal",
    "../utils/supabase"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};



export interface Proposal {
  id: string;
  type: string;
  name: string;
  version: string;
  source: {
    language: string;
    content: string;
    path: string;
  };
  sdoa: {
    layer: 1 | 2 | 3;
    placement: string;
    manifest: {
      operationalRole: string;
      optimization: {
        priority: string;
        assertionSuite?: string;
      };
    };
  };
  metrics: {
    usageCount: number;
    projectsObserved: number;
    confidence: number;
  };
}

export interface PipelineResult {
  ok: boolean;
  errors?: string[];
  prUrl?: string;
}

export async function runCreationPipeline(envelope: any): Promise<PipelineResult> {
  const startTime = Date.now();
  logger.info(`Starting creation pipeline`);
  const errors: string[] = [];
  const prUrls: string[] = [];

  for (const proposal of envelope.innovations || []) {
    const { name, source } = proposal;

    if (!source?.content || source.content.trim().length === 0) {
      logger.error(`Empty source content for ${name}`);
      errors.push(`Empty source content for ${name}`);
      continue;
    }

    const plannedPath = planCanonicalPath(proposal);
    if (!plannedPath) {
      logger.error(`Unable to determine canonical path for ${name}`);
      errors.push(`Unable to determine canonical path for ${name}`);
      continue;
    }

    const fileContent = `${buildAuditHeader(proposal, envelope.proposalId)}\n${source.content}`;

    await writeCanonicalFile(plannedPath, fileContent);

    const compliance = await runComplianceSuite(plannedPath, proposal);
    if (!compliance.ok) {
      logger.error(`Compliance failed for ${name}`);
      await recordPipelineStep(envelope.proposalId, "Probation Officer", "failed", { error: "Compliance suite failed", target: plannedPath });
      errors.push(...(compliance.errors || []));
      continue;
    }
    
    await recordPipelineStep(envelope.proposalId, "Probation Officer", "passed", { checks: compliance.errors?.length === 0 });
    await recordPipelineStep(envelope.proposalId, "Canonical Path Routing", "passed", { path: plannedPath });

    const prUrl = await openPrForProposal(proposal, plannedPath, fileContent);
    if (prUrl) {
      logger.info(`PR opened for ${name}: ${prUrl}`);
      prUrls.push(prUrl);
      await recordPipelineStep(envelope.proposalId, "PR Worker", "passed", { prUrl });
      
      // Save metadata locally
      const { savePRMetadataLocal } = require("../fisp/storeProposal");
      savePRMetadataLocal(envelope.proposalId, prUrl);

      // Save to Supabase if configured
      try {
        const { savePRMetadata } = require("../utils/supabase");
        await savePRMetadata(envelope.proposalId, prUrl);
      } catch (e) {}
    } else {
      await recordPipelineStep(envelope.proposalId, "PR Worker", "failed", { error: "Failed to open PR" });
    }
  }

  const isOk = errors.length === 0;
  await recordPipelineRun(envelope.proposalId, isOk ? "success" : "failed", Date.now() - startTime);

  return { ok: isOk, errors, prUrl: prUrls[0] };
}


function buildAuditHeader(proposal: any, envelopeId: string): string {
  const now = new Date().toISOString();
  const ext = inferExtensionFromType(proposal.type, proposal.source.language);

  return [
    "// ------------------------------------------------------------------",
    `// File:    ${proposal.name}.${ext}`,
    "// Version: 1.0.0",
    `// Updated: ${now}`,
    `// Changes: Community contribution via FISP Proposal ${proposal.id}`,
    "// ------------------------------------------------------------------",
  ].join("\n");
}

function inferExtensionFromType(type: string, language: string): string {
  if (language === "ts") return "ts";
  if (language === "js") return "js";
  if (language === "json") return "json";
  if (language === "yaml") return "yaml";
  // extend as needed
  return language || "txt";
}

export async function createModuleProposal(input: { filePath: string, source: string }): Promise<{ manifest: any, capabilitySurface: any, runtime: string }> {
  const pathParts = input.filePath.split(/[\\/]/);
  const basename = pathParts.pop() || "unknown";
  const name = basename.split('.')[0] || "UnknownModule";
  
  let runtime = "TypeScript";
  if (basename.endsWith(".py")) runtime = "Python";
  if (basename.endsWith(".go")) runtime = "Go";
  if (basename.endsWith(".rs")) runtime = "Rust";
  if (basename.endsWith(".js")) runtime = "JavaScript";
  
  return {
    manifest: {
      id: `${name}.module`,
      type: "module",
      layer: 3,
      runtime: runtime,
      version: "1.0.0",
      operationalRole: "extracted-innovation",
      optimization: { priority: "speed" },
      docs: `Auto-extracted from ${basename}`
    },
    capabilitySurface: {
      inferredFrom: basename,
      linesOfCode: input.source.split('\n').length
    },
    runtime: runtime
  };
}
