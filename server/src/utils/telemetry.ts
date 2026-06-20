import { supabase } from './supabase';
import { logger } from './logger';

/**
 * Pushes a top-level pipeline execution record to Supabase.
 * Fails silently so local SQLite governance isn't blocked.
 */
export async function recordPipelineRun(proposalId: string, status: string, durationMs: number = 0) {
  try {
    const { error } = await supabase.from('pipeline_runs').insert({
      proposal_id: proposalId,
      status,
      duration_ms: durationMs
    });
    if (error) throw error;
    logger.info(`Telemetry: Recorded pipeline run for ${proposalId}`);
  } catch (err: any) {
    logger.warn(`Telemetry Error (recordPipelineRun): ${err.message}`);
  }
}

/**
 * Pushes detailed metrics for a specific pipeline stage.
 */
export async function recordPipelineStep(proposalId: string, stepName: string, status: string, metrics: any = {}) {
  try {
    const { error } = await supabase.from('pipeline_steps').insert({
      proposal_id: proposalId,
      step_name: stepName,
      status,
      metrics
    });
    if (error) throw error;
    logger.info(`Telemetry: Recorded step '${stepName}' for ${proposalId}`);
  } catch (err: any) {
    logger.warn(`Telemetry Error (recordPipelineStep): ${err.message}`);
  }
}

/**
 * Pushes federation synchronization statistics.
 */
export async function recordFederationSync(peerId: string, status: string, proposalsSynced: number = 0) {
  try {
    const { error } = await supabase.from('federation_syncs').insert({
      peer_id: peerId,
      status,
      proposals_synced: proposalsSynced
    });
    if (error) throw error;
    logger.info(`Telemetry: Recorded federation sync for peer ${peerId}`);
  } catch (err: any) {
    logger.warn(`Telemetry Error (recordFederationSync): ${err.message}`);
  }
}
