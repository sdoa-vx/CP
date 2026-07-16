// ───────────────────────────
// File:    workflows/RecordTelemetryEvent.workflow.ts
// Version: 1.0.00
// Updated: 2026-07-13T00:00:00Z
// Changes: Initial anonymous telemetry ingestion
// ───────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

export interface RecordTelemetryEventInput {
  eventName: string;
  properties?: Record<string, unknown>;
  extensionVersion?: string;
}

const MAX_EVENT_NAME_LENGTH = 128;
const MAX_PROPERTIES_BYTES = 8192;

export class RecordTelemetryEventWorkflow {
  static MANIFEST = {
    id: 'RecordTelemetryEvent.workflow',
    type: 'workflow',
    version: '1.0.0',
    runtime: 'Universal',
    capabilities: ['telemetry:record'],
    dependencies: ['@supabase/supabase-js'],
    docs: { description: 'Records an anonymous usage event from the extension. No PII expected or accepted.' },
    last_modified: '2026-07-13T00:00:00Z',
    layer: 3,
    requires: ['SupabaseClient.adapter'],
    dataFiles: [],
    lifecycle: ['init', 'run', 'dispose'],
    actions: { commands: {}, events: {}, accepts: {}, slots: {} },
    operationalRole: 'assembly-line',
    optimization: { priority: 'low', assertionSuite: 'standard' }
  };

  private registry: { get: (name: string) => unknown } | undefined;

  constructor(registry?: { get: (name: string) => unknown }) {
    this.registry = registry;
  }

  init(registry: { get: (name: string) => unknown }) {
    this.registry = registry;
    return { ok: true, data: { status: 'RecordTelemetryEventWorkflow initialized' } };
  }

  async run(payload: RecordTelemetryEventInput) {
    try {
      if (!payload?.eventName || typeof payload.eventName !== 'string') {
        return { ok: false, error: 'eventName is required' };
      }
      if (payload.eventName.length > MAX_EVENT_NAME_LENGTH) {
        return { ok: false, error: `eventName exceeds ${MAX_EVENT_NAME_LENGTH} characters` };
      }

      const properties = payload.properties ?? {};
      const propertiesJson = JSON.stringify(properties);
      if (propertiesJson.length > MAX_PROPERTIES_BYTES) {
        return { ok: false, error: `properties exceeds ${MAX_PROPERTIES_BYTES} bytes` };
      }

      const client = this.registry?.get('supabase') as SupabaseClient | undefined;
      if (!client) {
        return { ok: false, error: 'No Supabase client available in registry' };
      }

      const { error } = await client.from('telemetry_events').insert({
        event_name: payload.eventName,
        properties,
        extension_version: payload.extensionVersion ?? null
      });

      if (error) {
        return { ok: false, error: `Supabase insert failed: ${error.message}` };
      }

      return { ok: true, data: { recorded: true } };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  dispose() {
    this.registry = undefined;
    return { ok: true };
  }
}

export default RecordTelemetryEventWorkflow;
