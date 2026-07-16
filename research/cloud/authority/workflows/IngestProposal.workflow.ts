// ───────────────────────────
// File:    workflows/IngestProposal.workflow.ts
// Version: 1.0.00
// Updated: 2026-07-13T00:00:00Z
// Changes: Initial proposal ingestion (extension submissions + webhook-derived)
// ───────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

export interface IngestProposalInput {
  source: 'extension' | 'github_webhook' | 'engine_vm';
  installationId?: number;
  moduleId?: string;
  moduleType?: string;
  payload: Record<string, unknown>;
}

export class IngestProposalWorkflow {
  static MANIFEST = {
    id: 'IngestProposal.workflow',
    type: 'workflow',
    version: '1.0.0',
    runtime: 'Universal',
    capabilities: ['proposals:ingest'],
    dependencies: ['@supabase/supabase-js'],
    docs: { description: 'Validates and writes an inbound SDOA module proposal to the proposals table.' },
    last_modified: '2026-07-13T00:00:00Z',
    layer: 3,
    requires: ['SupabaseClient.adapter'],
    dataFiles: [],
    lifecycle: ['init', 'run', 'dispose'],
    actions: { commands: {}, events: {}, accepts: {}, slots: {} },
    operationalRole: 'assembly-line',
    optimization: { priority: 'high', assertionSuite: 'strict' }
  };

  private registry: { get: (name: string) => unknown } | undefined;

  constructor(registry?: { get: (name: string) => unknown }) {
    this.registry = registry;
  }

  init(registry: { get: (name: string) => unknown }) {
    this.registry = registry;
    return { ok: true, data: { status: 'IngestProposalWorkflow initialized' } };
  }

  async run(payload: IngestProposalInput) {
    try {
      if (!payload || typeof payload !== 'object') {
        return { ok: false, error: 'Missing payload' };
      }
      if (!['extension', 'github_webhook', 'engine_vm'].includes(payload.source)) {
        return { ok: false, error: `Invalid source: ${String(payload.source)}` };
      }
      if (!payload.payload || typeof payload.payload !== 'object') {
        return { ok: false, error: 'payload.payload is required and must be an object' };
      }

      const client = this.registry?.get('supabase') as SupabaseClient | undefined;
      if (!client) {
        return { ok: false, error: 'No Supabase client available in registry' };
      }

      const { data, error } = await client
        .from('proposals')
        .insert({
          source: payload.source,
          installation_id: payload.installationId ?? null,
          module_id: payload.moduleId ?? null,
          module_type: payload.moduleType ?? null,
          payload: payload.payload,
          status: 'PENDING'
        })
        .select('id, status, created_at')
        .single();

      if (error) {
        return { ok: false, error: `Supabase insert failed: ${error.message}` };
      }

      return { ok: true, data: { proposalId: data.id, status: data.status, createdAt: data.created_at } };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  dispose() {
    this.registry = undefined;
    return { ok: true };
  }
}

export default IngestProposalWorkflow;
