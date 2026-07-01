/**
 * @SdoaManifest
 * id: SupabaseSubscriptions
 * type: UI_LOGIC
 * version: 1.0.0
 * description: Initializes realtime subscriptions to Supabase canonical memory to populate Svelte stores.
 * capabilities: memory.listen, telemetry.ingest
 * dependencies: supabase-js
 */
import { supabase } from './client';
import { proposalStore, lineageStore, governanceStore, meshEffectsStore, routingStore, meshLogsStore, pulseStore } from '../state/stores';

export function initRealtime() {
  if (!supabase) {
    console.warn("[SDOA Realtime] Supabase client is not initialized. Realtime subscriptions disabled.");
    return;
  }
  supabase
    .channel('mesh_logs')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mesh_logs' }, payload => {
      meshLogsStore.update(l => [payload.new, ...l].slice(0, 500));
    })
    .subscribe();

  supabase
    .channel('pulse_scores')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pulse_scores' }, payload => {
      pulseStore.update(p => ({ ...p, [payload.new.sleeve_id]: payload.new }));
    })
    .subscribe();

  supabase
    .channel('proposals')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'proposals' }, payload => {
      proposalStore.update(p => ({ ...p, [payload.new.id]: payload.new }));
    })
    .subscribe();

  supabase
    .channel('proposal_lineage')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'proposal_lineage' }, payload => {
      lineageStore.update(l => ({ ...l, [payload.new.proposal_id]: payload.new }));
    })
    .subscribe();

  supabase
    .channel('proposal_governance_events')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'proposal_governance_events' }, payload => {
      governanceStore.update(g => [...g, payload.new]);
    })
    .subscribe();

  supabase
    .channel('proposal_mesh_effects')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'proposal_mesh_effects' }, payload => {
      meshEffectsStore.update(m => [...m, payload.new]);
    })
    .subscribe();

  supabase
    .channel('chronicle_events')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chronicle_events' }, payload => {
      const e = payload.new;

      // Routing Waterfall
      if (e.event_type.startsWith('triage:')) {
        routingStore.update(r => [e, ...r].slice(0, 200));
      }

      // Scan progress is handled by scanChannel.ts (SSE primary, Chronicle-poll fallback),
      // not this Postgres-changes subscription.
    })
    .subscribe();
}
