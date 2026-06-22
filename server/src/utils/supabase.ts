import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

if (!url || !key) {
  throw new Error("Supabase not configured");
}

export const supabase = createClient(url, key);

export async function saveProposal(proposal: any) {
  const { error } = await supabase.from('proposals').insert({
    proposalId: proposal.id,
    timestamp: proposal.timestamp || new Date().toISOString(),
    origin: proposal.origin || 'extension',
    summary: proposal.summary || '',
    type: proposal.type || 'unknown',
    name: proposal.name || 'Unknown',
    innovations: proposal.innovations || []
  }).upsert(true);
  if (error) throw error;
}

export async function getProposalById(id: string) {
  const { data, error } = await supabase.from('proposals').select('*').eq('proposalId', id).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function savePRMetadata(proposalId: string, prUrl: string | null) {
  const status = prUrl ? 'open' : null;
  const { error } = await supabase.from('pr_metadata').upsert({
    proposalId,
    prUrl,
    status
  });
  if (error) throw error;
}

export async function getPRMetadata(proposalId: string) {
  const { data, error } = await supabase.from('pr_metadata').select('*').eq('proposalId', proposalId).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}