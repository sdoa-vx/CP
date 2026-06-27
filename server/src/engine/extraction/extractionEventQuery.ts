// ------------------------------------------------------------------
// File:    extractionEventQuery.ts
// Version: 1.0.0
// Updated: 2026-06-23T17:40:00.000Z
// Changes: Initial creation of queryExtractionEvents API
// SDOA compliance is required
// ------------------------------------------------------------------

export const MANIFEST = {
  id: "engine.extraction.queryEvents",
  type: "engine",
  layer: "substrate",
  runtime: "node",
  version: "1.0.0",
  action_surface: ["query.extractionEvents"],
  commands: ["queryExtractionEvents"],
  events: [],
  accepts: [],
  slots: [],
  dependencies: ["registry.schema.extractionEvent"],
  sovereign_lineage: "engine.extraction.queryEvents",
  variant_of: null,
  docs: {
    description: "Query API for SDOA ExtractionEvent records from the registry/Supabase.",
    last_modified: "2026-06-23T17:40:00.000Z"
  }
} as const;

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { ExtractionEvent } from "../../substrate/registry/schemas/extractionEvent.schema";

let supabase: SupabaseClient | null = null;

export function initExtractionEventQuery(url: string, key: string) {
  supabase = createClient(url, key);
}

export interface ExtractionEventQuery {
  limit?: number;
  moduleType?: string;
  minDriftScore?: number;
  maxDriftScore?: number;
  since?: string;
  until?: string;
}

export async function queryExtractionEvents(
  query: ExtractionEventQuery = {}
): Promise<ExtractionEvent[]> {
  if (!supabase) throw new Error("ExtractionEventQuery not initialized.");

  let q = supabase.from("extraction_history").select("*");

  if (query.moduleType) {
    q = q.eq("module_type", query.moduleType);
  }
  if (query.minDriftScore !== undefined) {
    q = q.gte("drift_score", query.minDriftScore);
  }
  if (query.maxDriftScore !== undefined) {
    q = q.lte("drift_score", query.maxDriftScore);
  }
  if (query.since) {
    q = q.gte("created_at", query.since);
  }
  if (query.until) {
    q = q.lte("created_at", query.until);
  }

  const limit = query.limit ?? 100;
  q = q.order("created_at", { ascending: false }).limit(limit);

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []) as ExtractionEvent[];
}
