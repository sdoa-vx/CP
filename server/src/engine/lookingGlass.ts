import { createClient } from "@supabase/supabase-js";
import { checkSemanticSimilarity } from "../fisp/semanticSimilarity";
import { createModuleProposal } from "../pipeline/CreationPipeline";

const supabase = createClient(
  process.env.SUPABASE_URL || "http://localhost:8000",
  process.env.SUPABASE_KEY || "anon-key"
);

export interface LlmRequest {
  task: "reason" | "plan" | "generate" | "review";
  input: string;
  context?: Record<string, unknown>;
}

export interface LlmResponse {
  reasoning: string;
  sdoaAligned: boolean;
  manifest?: Record<string, unknown>;
  capabilitySurface?: Record<string, unknown>;
  runtimeChoice?: string;
  moduleReuse?: string[];
}

export async function handleLlmRequest(req: LlmRequest): Promise<LlmResponse> {
  let filePath = "unknown";
  let source = req.input;

  try {
    const parsed = JSON.parse(req.input);
    if (parsed.filePath && parsed.source) {
      filePath = parsed.filePath;
      source = parsed.source;
    }
  } catch (e) {
    // Input might not be JSON, just use as source
  }

  // 1. Check similarity against existing modules
  const match = await checkSemanticSimilarity({ code: source });

  let result: LlmResponse;

  if (match && match.merged) {
    // Reuse path
    result = {
      reasoning: `Existing module ${match.id} matches this file.`,
      sdoaAligned: true,
      manifest: { id: match.id, note: match.suggestion },
      capabilitySurface: {},
      runtimeChoice: "TypeScript",
      moduleReuse: [match.id]
    };
  } else {
    // 2. New module path
    const proposal = await createModuleProposal({ filePath, source });
    result = {
      reasoning: `No existing module matched; proposing new sleeve.`,
      sdoaAligned: true,
      manifest: proposal.manifest,
      capabilitySurface: proposal.capabilitySurface,
      runtimeChoice: proposal.runtime,
      moduleReuse: []
    };
  }

  // Optionally log to mesh_logs
  await supabase.from("mesh_logs").insert({
    authority: "looking_glass",
    event_type: "reasoning",
    details: { request: req, response: result },
    timestamp: new Date().toISOString()
  });

  return result;
}

export async function sdoaAgent(task: string, input: string) {
  return handleLlmRequest({ task: task as any, input });
}
