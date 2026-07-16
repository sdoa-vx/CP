// ───────────────────────────
// File:    workflows/QueryCanonicalLibrary.workflow.ts
// Version: 1.0.00
// Updated: 2026-07-13T00:00:00Z
// Changes: Initial canonical module search/list
// ───────────────────────────
//
// Reads only — this workflow never needs a secret-tier key in principle
// (canonical_library allows anon SELECT via RLS), but it is still run
// through the service-scoped client for consistency with the other
// workflows and to avoid a second client instantiation path.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface QueryCanonicalLibraryInput {
  /** Free-text match against id/description. Optional. */
  search?: string;
  /** Filter by SDOA module type (primitive, feature, adapter, ...). Optional. */
  type?: string;
  limit?: number;
}

export class QueryCanonicalLibraryWorkflow {
  static MANIFEST = {
    id: 'QueryCanonicalLibrary.workflow',
    type: 'workflow',
    version: '1.0.0',
    runtime: 'Universal',
    capabilities: ['canonical-library:search'],
    dependencies: ['@supabase/supabase-js'],
    docs: { description: 'Searches/lists canonical SDOA modules for the discovery API.' },
    last_modified: '2026-07-13T00:00:00Z',
    layer: 3,
    requires: ['SupabaseClient.adapter'],
    dataFiles: [],
    lifecycle: ['init', 'run', 'dispose'],
    actions: { commands: {}, events: {}, accepts: {}, slots: {} },
    operationalRole: 'registrar',
    optimization: { priority: 'medium', assertionSuite: 'standard' }
  };

  private registry: { get: (name: string) => unknown } | undefined;

  constructor(registry?: { get: (name: string) => unknown }) {
    this.registry = registry;
  }

  init(registry: { get: (name: string) => unknown }) {
    this.registry = registry;
    return { ok: true, data: { status: 'QueryCanonicalLibraryWorkflow initialized' } };
  }

  async run(payload: QueryCanonicalLibraryInput = {}) {
    try {
      const client = this.registry?.get('supabase') as SupabaseClient | undefined;
      if (!client) {
        return { ok: false, error: 'No Supabase client available in registry' };
      }

      const limit = Math.min(Math.max(payload.limit ?? 25, 1), 100);

      let query = client
        .from('canonical_library')
        .select('id, type, layer, version, sdoa_version, description, published_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (payload.type) {
        query = query.eq('type', payload.type);
      }
      if (payload.search) {
        query = query.or(`id.ilike.%${payload.search}%,description.ilike.%${payload.search}%`);
      }

      const { data, error } = await query;

      if (error) {
        return { ok: false, error: `Supabase query failed: ${error.message}` };
      }

      return { ok: true, data: { modules: data ?? [], count: data?.length ?? 0 } };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  dispose() {
    this.registry = undefined;
    return { ok: true };
  }
}

export default QueryCanonicalLibraryWorkflow;
