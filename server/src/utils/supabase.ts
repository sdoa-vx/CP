import { createClient } from '@supabase/supabase-js';

export const MANIFEST = {
  id: "supabase.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "supabase",
    "saveProposal",
    "getProposalById",
    "savePRMetadata",
    "getPRMetadata"
  ],
  dependencies: [
    "@supabase/supabase-js"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};



const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

export const supabase = (url && key) ? createClient(url, key) : null;

export async function saveProposal(proposal: any) {
  if (!supabase) {
    console.warn("[SDOA] Supabase not configured. Skipping saveProposal to cloud.");
    return;
  }
  const { error } = await supabase.from('proposals').upsert({
    proposalId: proposal.id,
    timestamp: proposal.timestamp || new Date().toISOString(),
    origin: proposal.origin || 'extension',
    summary: proposal.summary || '',
    type: proposal.type || 'unknown',
    name: proposal.name || 'Unknown',
    innovations: proposal.innovations || []
  });
  if (error) throw error;
}

export async function getProposalById(id: string) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('proposals').select('*').eq('proposalId', id).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function savePRMetadata(proposalId: string, prUrl: string | null) {
  if (!supabase) {
    console.warn("[SDOA] Supabase not configured. Skipping savePRMetadata to cloud.");
    return;
  }
  const status = prUrl ? 'open' : null;
  const { error } = await supabase.from('pr_metadata').upsert({
    proposalId,
    prUrl,
    status
  });
  if (error) throw error;
}

export async function getPRMetadata(proposalId: string) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('pr_metadata').select('*').eq('proposalId', proposalId).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}