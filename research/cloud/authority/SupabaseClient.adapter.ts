// ───────────────────────────
// File:    SupabaseClient.adapter.ts
// Version: 1.0.00
// Updated: 2026-07-13T00:00:00Z
// Changes: Initial cloud Supabase adapter (mirrors LlmBroker.adapter.js pattern)
// ───────────────────────────
//
// Non-goal: this file does not read env vars or secrets itself. The Worker
// (infra, non-sdoa-compliant, see mcp-worker/manifest.json) is responsible
// for reading its own bindings/secrets and passing plain strings in. This
// keeps the sovereign testable without a Workers runtime.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseAdapterConfig {
  url: string;
  /** A secret-tier key (sb_secret_*) or legacy service_role JWT. Never the anon/publishable key. */
  serviceKey: string;
}

export class SupabaseClientAdapter {
  static MANIFEST = {
    id: 'SupabaseClient.adapter',
    type: 'adapter',
    version: '1.0.0',
    runtime: 'Universal',
    capabilities: ['supabase:client', 'state:read', 'state:write'],
    dependencies: ['@supabase/supabase-js'],
    docs: { description: 'Creates a service-scoped Supabase client for cloud workflows. Bypasses RLS — callers must be trusted (Worker/VM only).' },
    last_modified: '2026-07-13T00:00:00Z',
    layer: 3,
    requires: [],
    dataFiles: [],
    lifecycle: ['init', 'run', 'dispose'],
    actions: { commands: {}, events: {}, accepts: {}, slots: {} },
    operationalRole: 'registrar',
    optimization: { priority: 'high', assertionSuite: 'strict' }
  };

  private registry: unknown;
  private client: SupabaseClient | null = null;
  private config: SupabaseAdapterConfig | null = null;

  constructor(registry?: unknown) {
    this.registry = registry;
  }

  init(registry: unknown) {
    this.registry = registry;
    return { ok: true, data: { status: 'SupabaseClientAdapter initialized' } };
  }

  /**
   * run({ action: 'connect', config }) — build the underlying client.
   * run({ action: 'getClient' })        — return the already-built client.
   */
  run(payload: { action: 'connect'; config: SupabaseAdapterConfig } | { action: 'getClient' }) {
    switch (payload.action) {
      case 'connect': {
        this.config = payload.config;
        this.client = createClient(payload.config.url, payload.config.serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false }
        });
        return { ok: true, data: { status: 'connected' } };
      }
      case 'getClient': {
        if (!this.client) {
          return { ok: false, error: 'SupabaseClientAdapter.run(getClient) called before connect' };
        }
        return { ok: true, data: { client: this.client } };
      }
      default:
        return { ok: false, error: `Unknown action: ${JSON.stringify(payload)}` };
    }
  }

  dispose() {
    this.client = null;
    this.config = null;
    this.registry = null;
    return { ok: true };
  }
}

export default SupabaseClientAdapter;
