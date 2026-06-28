// ------------------------------------------------------------------
// File:    extractionHistoryStore.ts
// Version: 1.0.0
// Updated: 2026-06-23T17:00:00.000Z
// Changes: Initial creation of Supabase-backed extraction history store
// SDOA compliance is required
// ------------------------------------------------------------------

export const MANIFEST = {
  id: "engine.extraction.historyStore",
  type: "engine",
  layer: "substrate",
  runtime: "node",
  version: "1.0.0",
  action_surface: ["history.record", "history.query"],
  commands: ["recordExtractionEvent", "fetchExtractionHistory"],
  events: [],
  accepts: ["extraction.diff.payload"],
  slots: [],
  dependencies: [],
  sovereign_lineage: "engine.extraction.historyStore",
  variant_of: null,
  docs: {
    description: "Persists extraction events to Supabase and allows querying history.",
    last_modified: "2026-06-23T17:00:00.000Z"
  }
} as const;

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabase: SupabaseClient | null = null;

export function initHistoryStore(url: string, key: string) {
  supabase = createClient(url, key);
}

export interface ExtractionHistoryRecord {
  id: string;
  file: string;
  modulePath: string;
  driftScore: number;
  extractionScore: number;
  payload: any;
  created_at?: string;
}

export async function recordExtractionEvent(record: ExtractionHistoryRecord) {
  if (!supabase) throw new Error("HistoryStore not initialized.");
  const { error } = await supabase.from("extraction_history").insert({
    id: record.id,
    file: record.file,
    module_path: record.modulePath,
    drift_score: record.driftScore,
    extraction_score: record.extractionScore,
    payload: record.payload
  });
  if (error) throw error;
}

export async function fetchExtractionHistory(limit = 50): Promise<ExtractionHistoryRecord[]> {
  if (!supabase) throw new Error("HistoryStore not initialized.");
  const { data, error } = await supabase
    .from("extraction_history")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    file: row.file,
    modulePath: row.module_path,
    driftScore: row.drift_score,
    extractionScore: row.extraction_score,
    payload: row.payload,
    created_at: row.created_at
  }));
}
