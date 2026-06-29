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
import { proposalStore, lineageStore, governanceStore, meshEffectsStore, routingStore, scanStore } from '../state/stores';

export function initRealtime() {
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

      // Scan Progression
      if (e.event_type === 'scan:start') {
        scanStore.set({
          index: 0,
          total: e.payload?.totalFiles || 0,
          file: null,
          previousFile: null,
          nextFile: null,
          percent: 0,
          active: true
        });
      }

      if (e.event_type === 'scan:fileProgress') {
        scanStore.update(s => ({
          ...s,
          index: e.payload?.index || s.index,
          total: e.payload?.total || s.total,
          previousFile: s.file,
          file: e.payload?.file || null,
          nextFile: null,
          percent: Math.round(((e.payload?.index || 0) / (e.payload?.total || 1)) * 100)
        }));
      }

      if (e.event_type === 'scan:end') {
        scanStore.update(s => ({ ...s, active: false }));
      }
    })
    .subscribe();
}
