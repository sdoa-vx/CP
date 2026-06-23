import { supabase } from './supabase';
import { logger } from './logger';
import { db } from '../fisp/database';

export const MANIFEST = {
  id: "telemetry.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "recordPipelineRun",
    "recordPipelineStep",
    "recordFederationSync"
  ],
  dependencies: [
    "./supabase",
    "./logger",
    "../fisp/database"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};



function queueOfflineItem(target: string, payload: any) {
  try {
    db.prepare('INSERT INTO offline_queue (type, target, payload, created_at) VALUES (?, ?, ?, ?)').run('SUPABASE', target, JSON.stringify(payload), new Date().toISOString());
  } catch (e) {
    // totally silent
  }
}

/**
 * Pushes a top-level pipeline execution record to Supabase.
 * Fails silently so local SQLite governance isn't blocked.
 */
export async function recordPipelineRun(proposalId: string, status: string, durationMs: number = 0) {
  const payload = {
    proposal_id: proposalId,
    status,
    duration_ms: durationMs
  };
  try {
    if (!supabase) throw new Error("Supabase unavailable");
    const { error } = await supabase.from('pipeline_runs').insert(payload);
    if (error) throw error;
    logger.info(`Telemetry: Recorded pipeline run for ${proposalId}`);
  } catch (err: any) {
    queueOfflineItem('pipeline_runs', payload);
  }
}

/**
 * Pushes detailed metrics for a specific pipeline stage.
 */
export async function recordPipelineStep(proposalId: string, stepName: string, status: string, metrics: any = {}) {
  const payload = {
    proposal_id: proposalId,
    step_name: stepName,
    status,
    metrics
  };
  try {
    if (!supabase) throw new Error("Supabase unavailable");
    const { error } = await supabase.from('pipeline_steps').insert(payload);
    if (error) throw error;
    logger.info(`Telemetry: Recorded step '${stepName}' for ${proposalId}`);
  } catch (err: any) {
    queueOfflineItem('pipeline_steps', payload);
  }
}

/**
 * Pushes federation synchronization statistics.
 */
export async function recordFederationSync(peerId: string, status: string, proposalsSynced: number = 0) {
  const payload = {
    peer_id: peerId,
    status,
    proposals_synced: proposalsSynced
  };
  try {
    if (!supabase) throw new Error("Supabase unavailable");
    const { error } = await supabase.from('federation_syncs').insert(payload);
    if (error) throw error;
    logger.info(`Telemetry: Recorded federation sync for peer ${peerId}`);
  } catch (err: any) {
    queueOfflineItem('federation_syncs', payload);
  }
}
