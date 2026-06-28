import { createClient } from '@supabase/supabase-js';
import { db } from "../fisp/database";

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

// Credentials come from the environment ONLY. Never hard-code keys here — this
// file is published in a public repo, and base64 is not encryption. Set
// SUPABASE_URL and SUPABASE_KEY in a git-ignored .env (loaded via dotenv) or in
// the host environment. Server-side may use a restricted key; public surfaces
// (the website) get only the anon key, protected by row-level-security.
const defaultUrl = process.env.SUPABASE_URL || "";
const defaultKey = process.env.SUPABASE_KEY || "";

export let supabase: any = null;
export let url: string = defaultUrl;
export let key: string = defaultKey;

export function reinitializeSupabaseClient(newUrl?: string, newKey?: string) {
  url = newUrl || defaultUrl;
  key = newKey || defaultKey;
  if (url && key) {
    console.log("[SDOA] Supabase connection initializing...");
    supabase = createClient(url, key);
  } else {
    supabase = null;
  }
}

function initFromConfig() {
  let initialUrl = defaultUrl;
  let initialKey = defaultKey;
  try {
    const row = db.prepare("SELECT value FROM metadata_store WHERE key = 'engine_config'").get() as any;
    if (row) {
      const config = JSON.parse(row.value);
      initialUrl = config.supabaseUrl || defaultUrl;
      initialKey = config.supabaseKey || defaultKey;
    }
  } catch (e) {
    console.warn("[SDOA] Failed to read config for Supabase initialization.");
  }
  reinitializeSupabaseClient(initialUrl, initialKey);
}

// Initial setup
initFromConfig();

let failureCount = 0;

export async function evaluateConnection() {
  if (!supabase || !url || !key) return false;
  try {
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
    const queryPromise = supabase.from('sdoa_portfolio').select('id').limit(1);
    
    const { error } = await Promise.race([queryPromise, timeoutPromise]) as any;
    if (error) throw error;
    failureCount = 0;
    return true;
  } catch (err) {
    failureCount++;
    console.warn(`[SDOA] Supabase connection failed (${failureCount} times):`, err instanceof Error ? err.message : String(err));
    if (failureCount >= 3) {
      console.log(`[SDOA] Renewing Supabase connection...`);
      supabase = createClient(url, key);
      failureCount = 0;
    }
    return false;
  }
}

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