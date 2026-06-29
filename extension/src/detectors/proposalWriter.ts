import { createClient } from "@supabase/supabase-js";
import * as vscode from "vscode";

let supabase: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (supabase) return supabase;

  const config = vscode.workspace.getConfiguration("sdoaMcp");
  const url = config.get<string>("supabaseUrl") || process.env.SUPABASE_URL || "";
  const key = config.get<string>("supabaseKey") || process.env.SUPABASE_KEY || "";

  if (!url || !key) {
    console.warn("Supabase URL or Key not configured in SDOA MCP settings.");
    return null;
  }

  supabase = createClient(url, key);
  return supabase;
}

export interface InnovationProposal {
  clusterId: string;
  patternId: string;
  moduleName: string;
  capabilitySurface: any;
  reasoning: string;
}

export interface ExtractionMetadata {
  path: string;
  manifest: any;
  runtime: string;
}

export async function writeProposal(proposal: InnovationProposal): Promise<any> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data, error } = await client
    .from("proposals")
    .insert({
      id: crypto.randomUUID(),
      cluster_id: proposal.clusterId,
      pattern_id: proposal.patternId,
      module_suggestion: proposal.moduleName,
      capability_surface: proposal.capabilitySurface,
      reasoning: proposal.reasoning,
      state: "pending"
    })
    .select();

  if (error) {
    console.error("Error writing proposal to Supabase:", error);
    throw error;
  }
  return data ? data[0] : null;
}

export async function writeExtraction(proposalId: string, extraction: ExtractionMetadata): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  const { error } = await client.from("proposal_extractions").insert({
    id: crypto.randomUUID(),
    proposal_id: proposalId,
    extracted_module_path: extraction.path,
    manifest: extraction.manifest,
    runtime: extraction.runtime
  });

  if (error) {
    console.error("Error writing extraction to Supabase:", error);
    throw error;
  }
}
